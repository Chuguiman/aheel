// process-all-html-without-json.js
/**
 * Script para procesar todos los archivos HTML que no tienen JSON correspondiente,
 * independientemente de su estado en la base de datos
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { processHtmlBatch } = require('./process-html-to-json');

async function findAllHtmlWithoutJson() {
  try {
    // Obtener todos los archivos HTML (excluyendo los de redirección)
    const origenDir = path.join(process.cwd(), 'origen');
    console.log(`📂 Buscando archivos HTML en: ${origenDir}`);
    
    const allFiles = await fs.readdir(origenDir);
    console.log(`📁 Total de archivos en directorio origen: ${allFiles.length}`);
    
    const htmlFiles = allFiles
      .filter(file => file.endsWith('.html') && !file.includes('_redirected'));
    
    console.log(`📄 Archivos HTML encontrados (excluyendo redirected): ${htmlFiles.length}`);
    
    // Normalizar nombres de archivo a expedientes
    const htmlExpedientes = htmlFiles.map(file => path.basename(file, '.html'));
    
    // Obtener todos los archivos JSON
    const jsonDir = path.join(process.cwd(), 'json');
    console.log(`📂 Buscando archivos JSON en: ${jsonDir}`);
    
    let jsonFiles = [];
    try {
      const allJsonFiles = await fs.readdir(jsonDir);
      console.log(`📁 Total de archivos en directorio json: ${allJsonFiles.length}`);
      jsonFiles = allJsonFiles.filter(file => file.endsWith('.json'));
      console.log(`📄 Archivos JSON encontrados: ${jsonFiles.length}`);
    } catch (error) {
      // Si el directorio no existe, crearlo
      if (error.code === 'ENOENT') {
        console.log(`📁 Directorio JSON no encontrado, creándolo: ${jsonDir}`);
        await fs.mkdir(jsonDir, { recursive: true });
        jsonFiles = [];
      } else {
        throw error;
      }
    }
    
    // Normalizar nombres de archivo a expedientes
    const jsonExpedientes = jsonFiles.map(file => path.basename(file, '.json'));
    
    // Crear Set de archivos JSON para búsqueda más eficiente
    const jsonSet = new Set(jsonExpedientes);
    
    // Filtrar HTMLs que no tienen JSON correspondiente
    const pendingHtml = htmlExpedientes.filter(htmlFile => !jsonSet.has(htmlFile));
    
    // Mostrar algunos ejemplos para depuración
    if (pendingHtml.length > 0) {
      console.log(`🔍 Primeros 5 expedientes pendientes: ${pendingHtml.slice(0, 5).join(', ')}`);
    }
    
    return pendingHtml;
  } catch (error) {
    console.error('❌ Error al obtener HTMLs pendientes:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log(`
    ======================================================
    🔄 PROCESAMIENTO DE TODOS LOS HTML SIN JSON
    ======================================================
    Este script procesará todos los archivos HTML que no
    tienen un archivo JSON correspondiente, independientemente
    de su estado en la base de datos.
    ======================================================
    `);
    
    // Encontrar todos los HTML sin JSON
    const pendingHtmls = await findAllHtmlWithoutJson();
    
    if (pendingHtmls.length === 0) {
      console.log(`✅ No hay archivos HTML pendientes por procesar. Todo está al día.`);
      return;
    }
    
    console.log(`📊 Se encontraron ${pendingHtmls.length} archivos HTML sin JSON correspondiente.`);
    
    // Preguntar si desea procesar todos
    if (process.env.AUTO_CONFIRM !== 'true') {
      console.log(`
      🚨 ADVERTENCIA: Este proceso puede tardar bastante tiempo para ${pendingHtmls.length} archivos.
      Si desea continuar, presione Enter. Para cancelar, presione Ctrl+C.
      `);
      
      // Esperar confirmación del usuario
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
    }
    
    // Procesar los expedientes pendientes
    const maxWorkers = parseInt(process.env.MAX_WORKERS || '3');
    const batchSize = parseInt(process.env.BATCH_SIZE || '100');
    
    console.log(`🛠️ Procesando con ${maxWorkers} workers en paralelo...`);
    console.log(`📦 Tamaño de lote configurado: ${batchSize}`);
    
    // Dividir en lotes más pequeños si es necesario
    let batches = [];
    for (let i = 0; i < pendingHtmls.length; i += batchSize) {
      batches.push(pendingHtmls.slice(i, i + batchSize));
    }
    
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let allFailedExpedientes = [];
    
    // Procesar cada lote
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Procesando lote ${i+1} de ${batches.length} (${batch.length} expedientes)...`);
      
      const results = await processHtmlBatch(batch, maxWorkers);
      
      totalProcessed += results.total;
      totalSuccess += results.successful;
      totalFailed += results.failed;
      allFailedExpedientes = [...allFailedExpedientes, ...results.failedExpedientes];
      
      console.log(`
      📊 Progreso actual:
      - Total procesados: ${totalProcessed}/${pendingHtmls.length}
      - Exitosos: ${totalSuccess}
      - Fallidos: ${totalFailed}
      `);
    }
    
    // Mostrar resultados finales
    console.log(`
    ======================================================
    ✅ PROCESAMIENTO COMPLETADO
    ======================================================
    
    📊 Resultados finales:
    - Total de expedientes procesados: ${totalProcessed}
    - Exitosos: ${totalSuccess}
    - Fallidos: ${totalFailed}
    
    ${totalFailed > 0 ? `⚠️ Expedientes fallidos: ${allFailedExpedientes.join(', ')}` : ''}
    
    ======================================================
    `);
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

// Ejecutar función principal
main().catch(error => {
  console.error('❌ Error no controlado:', error);
  process.exit(1);
});