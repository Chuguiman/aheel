// download-expedientes.js
require('dotenv').config();
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config/mysql.config');
const { ensureDirectoryExists, randomDelay } = require('./helpers/utils');
const { SicScraper } = require('./services/scraper');

// Función para el worker
async function workerProcess() {
  const { 
    expedientes, 
    configDB, 
    directories 
  } = workerData;
  
  const results = {
    processed: [],
    failed: []
  };
  
  // Crear directorios necesarios
  for (const dir of directories) {
    await ensureDirectoryExists(dir);
  }
  
  // Inicializar el scraper
  const scraper = new SicScraper({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    await scraper.initialize();
    
    // Procesar cada expediente en el lote
    for (const expediente of expedientes) {
      try {
        const result = await scraper.processExpediente(expediente);
        
        if (result.success) {
          results.processed.push(expediente);
          console.log(`✅ Expediente ${expediente} procesado con éxito`);
        } else {
          results.failed.push(expediente);
          console.log(`❌ Error al procesar expediente ${expediente}`);
        }
      } catch (error) {
        console.error(`❌ Error no controlado al procesar ${expediente}:`, error.message);
        results.failed.push(expediente);
      }
    }
    
    // Actualizar estado en base de datos
    const connection = await mysql.createConnection(configDB);
    
    if (results.processed.length > 0) {
      for (const exp of results.processed) {
        await connection.query('UPDATE scraping_gac_29k SET status = ? WHERE idsic = ?', ['DOWNLOADED', exp]);
      }
    }
    
    if (results.failed.length > 0) {
      for (const exp of results.failed) {
        await connection.query('UPDATE scraping_gac_29k SET status = ? WHERE idsic = ?', ['DOWNLOAD_FAILED', exp]);
      }
    }
    
    await connection.end();
    
    // Enviar resultados al hilo principal
    parentPort.postMessage(results);
  } catch (error) {
    console.error('❌ Error en el worker:', error);
    parentPort.postMessage({ error: error.message });
  } finally {
    await scraper.close();
  }
}

// Función para preguntar si continuar
function askToContinue() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    console.log('Esperando entrada del usuario...');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      const input = data.toString().trim().toLowerCase();
      resolve(input === 'y' || input === 'yes' || input === 's' || input === 'si');
    });
  });
}


// Función principal
async function main() {
  if (!isMainThread) {
    // Este es un worker
    await workerProcess();
    return;
  }
  
  try {
    // Configuración
    const batchSize = parseInt(process.env.BATCH_SIZE || '10');
    const pauseEvery = parseInt(process.env.PAUSE_EVERY || '250');
    const numWorkers = parseInt(process.env.NUM_WORKERS || '2'); // Número de workers
    
    console.log(`
      ======================================================
      📥 DESCARGA DE EXPEDIENTES SIPI/SIC (WORKERS)
      ======================================================
      Configuración:
      - Tamaño de lote: ${batchSize} expedientes
      - Pausa cada: ${pauseEvery} lotes
      - Número de workers: ${numWorkers}
      ======================================================
    `);
    
    // Crear directorios necesarios
    const directories = ['origen', 'media'];
    for (const dir of directories) {
      await ensureDirectoryExists(dir);
      console.log(`✅ Directorio creado/verificado: ${dir}`);
    }
    
    // Conectar a la base de datos
    const connection = await mysql.createConnection(config);
    
    // Obtener expedientes pendientes
    const [rows] = await connection.query(`
      SELECT idsic FROM scraping_gac_29k 
      WHERE status = 'PENDING' AND active = 1
      ORDER BY idsic DESC
      LIMIT ?
    `, [batchSize]);
    
    const expedientes = rows.map(row => row.idsic);
    
    await connection.end();
    
    if (expedientes.length === 0) {
      console.log('✅ No hay expedientes pendientes para descargar.');
      return;
    }
    
    console.log(`📥 Descargando ${expedientes.length} expedientes...`);
    
    // Dividir en lotes pequeños
    const downloadBatchSize = 5; // Procesar de 5 en 5
    const batches = [];
    
    for (let i = 0; i < expedientes.length; i += downloadBatchSize) {
      batches.push(expedientes.slice(i, i + downloadBatchSize));
    }
    
    console.log(`🔁 Procesando en ${batches.length} lotes de ${downloadBatchSize} expedientes`);
    
    const overallResults = {
      processed: [],
      failed: []
    };
    
    // Procesar lotes con pausa
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n📦 Procesando lote ${i+1}/${batches.length} (${batch.length} expedientes)`);
      
      // Dividir el lote actual en sublotes para workers
      const workerBatches = [];
      const subloteSize = Math.ceil(batch.length / numWorkers);
      
      for (let j = 0; j < batch.length; j += subloteSize) {
        workerBatches.push(batch.slice(j, j + subloteSize));
      }
      
      // Crear y ejecutar workers
      const workerPromises = workerBatches.map(sublote => 
        new Promise((resolve, reject) => {
          const worker = new Worker(__filename, {
            workerData: { 
              expedientes: sublote, 
              configDB: config,
              directories 
            }
          });
          
          worker.on('message', (results) => {
            if (results.error) {
              reject(new Error(results.error));
            } else {
              resolve(results);
            }
          });
          
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker stopped with exit code ${code}`));
            }
          });
        })
      );
      
      // Esperar resultados de los workers
      const workerResults = await Promise.allSettled(workerPromises);
      
      // Procesar resultados de los workers
      workerResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          overallResults.processed.push(...result.value.processed);
          overallResults.failed.push(...result.value.failed);
        } else {
          console.error(`❌ Error en worker ${index}:`, result.reason);
          // Marcar todos los expedientes de este worker como fallidos
          overallResults.failed.push(...workerBatches[index]);
        }
      });
      
      console.log(`✅ Lote ${i+1} completado: ${batch.length} expedientes procesados`);
      
      // Pausar cada 'pauseEvery' lotes
      if ((i + 1) % pauseEvery === 0 && i < batches.length - 1) {
        console.log(`
          ⏸️ Se han procesado ${pauseEvery} lotes. ¿Desea continuar?
          Presione 'Y' para continuar o cualquier otra tecla para detener el proceso.
        `);
        
        const response = await askToContinue();
        if (!response) {
          console.log('⛔ Proceso detenido por el usuario.');
          break;
        }
      }
      
      // Pequeño retraso entre lotes para evitar sobrecarga
      await randomDelay(1000, 2000);
    }
    
    // Mostrar resultados finales
    console.log(`
      📊 Resultados de la descarga:
      - Total: ${expedientes.length}
      - Exitosos: ${overallResults.processed.length}
      - Fallidos: ${overallResults.failed.length}
      - Expedientes fallidos: ${overallResults.failed.length > 0 ? overallResults.failed.join(', ') : 'Ninguno'}
    `);
    
  } catch (error) {
    console.error('❌ Error en la descarga de expedientes:', error);
  }
}

// Ejecutar el script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main }; // Para posibles importaciones o pruebas