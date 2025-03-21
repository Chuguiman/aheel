// src/process-html-to-json.js
/**
 * Script específico para procesar archivos HTML
 * que ya están descargados pero no convertidos a JSON
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { extractDataWithErrorHandling } = require('./services/extractor-sic');
const { extraerRepresentantes } = require('./helpers/representantes-extractor');
const { 
  storeJsonFile, 
  markFailed, 
  markDone, 
  cleanupHtmlIfJsonExists,
  storeFailureInDb
} = require('./database/batch-processor');
const { 
  insertToSimPrecarga, 
  getFailedExpedientes, 
  getDownloadedExpedientes, 
  insertBatchStats, 
  createStatsTableIfNotExists 
} = require('./database/db-connector');
const { randomDelay } = require('./helpers/utils');
const config = require('./config/mysql.config');

/**
 * Obtiene la lista de expedientes que tienen HTML pero no JSON
 */
async function getHtmlWithoutJson() {
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

/**
 * Extrae la URL de redirección de un HTML si existe
 * @param {string} html - Contenido HTML a analizar
 * @returns {string|null} - URL de redirección o null si no hay
 */
function extractRedirectUrl(html) {
  try {
    // Método 1: Buscar div#first-redirect-url
    const redirectDivMatch = html.match(/<div\s+id="first-redirect-url"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>/i);
    if (redirectDivMatch && redirectDivMatch[1]) {
      return redirectDivMatch[1];
    }
    
    // Método 2: Buscar meta refresh
    const metaRefreshMatch = html.match(/<meta\s+http-equiv="refresh"[^>]*content="[^"]*URL=([^"]+)"[^>]*>/i);
    if (metaRefreshMatch && metaRefreshMatch[1]) {
      return metaRefreshMatch[1];
    }
    
    // Método 3: Buscar script de redirección
    const scriptRedirectMatch = html.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
    if (scriptRedirectMatch && scriptRedirectMatch[1]) {
      return scriptRedirectMatch[1];
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ Error al extraer URL de redirección:', error.message);
    return null;
  }
}

/**
 * Procesa un solo archivo HTML, extrae datos y guarda como JSON
 * Versión mejorada que gestiona mejor las direcciones duplicadas y caracteres especiales
 * @param {string} expediente - Número de expediente a procesar
 * @returns {Promise<boolean>} - true si se procesó correctamente, false si hubo un error
 */
async function processSingleHtml(expediente) {
  try {
    console.log(`🔍 Procesando HTML para expediente: ${expediente}`);
    
    // Ruta al archivo HTML
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    
    // Verificar que el archivo existe
    try {
      await fs.access(htmlPath);
      console.log(`✅ Archivo HTML encontrado: ${htmlPath}`);
    } catch (error) {
      console.error(`❌ Archivo HTML no encontrado: ${htmlPath}`);
      return false;
    }
    
    // Leer el HTML original
    let rawHtml = await fs.readFile(htmlPath, 'utf8');
    console.log(`📄 HTML leído, tamaño: ${(rawHtml.length / 1024).toFixed(2)} KB`);
    
    // Verificar si contiene una redirección
    const redirectUrl = extractRedirectUrl(rawHtml);
    
    // Si hay redirección, mostrarla
    if (redirectUrl) {
      console.log(`🔄 Detectada redirección para expediente ${expediente}: ${redirectUrl}`);
      // Aquí podrías implementar código para seguir la redirección
    }
    
    // Extraer datos del HTML (con el extractor existente)
    console.log(`🧮 Extrayendo datos para expediente ${expediente}...`);
    const data = await extractDataWithErrorHandling(expediente);
    
    // Validar y limpiar los datos antes de guardarlos
    cleanAndValidateData(data);
    
    console.log(`✅ Datos extraídos exitosamente para ${expediente}`);
    
    // Guardar como JSON
    console.log(`💾 Guardando JSON para expediente ${expediente}...`);
    await storeJsonFile(expediente, data);
    
    // Insertar en la base de datos usando la función existente
    console.log(`📊 Insertando datos en la base de datos para ${expediente}...`);
    const insertResult = await insertToSimPrecarga(data, config);
    
    if (!insertResult.success) {
      // Si la inserción falló, marcar como fallido y registrar el error
      console.error(`❌ Error al insertar datos en la base de datos para ${expediente}: ${insertResult.error || "Error desconocido"}`);
      await markFailed(expediente);
      await storeFailureInDb(expediente, insertResult.error || "Error desconocido al insertar en la base de datos", 1);
      return false;
    }
    
    // Marcar como completado en la base de datos
    console.log(`✏️ Actualizando estado en BD para ${expediente}...`);
    await markDone(expediente);
    
    // Eliminar HTML si está configurado
    if (process.env.CLEAN_HTML === 'true') {
      console.log(`🗑️ Eliminando HTML original para ${expediente}...`);
      await cleanupHtmlIfJsonExists(expediente);
    }
    
    console.log(`✅ Procesamiento completo para expediente ${expediente}`);
    return true;
  } catch (error) {
    console.error(`❌ Error al procesar HTML para expediente ${expediente}:`, error);
    try {
      await markFailed(expediente);
      await storeFailureInDb(expediente, error.message, 1);
    } catch (dbError) {
      console.error(`❌ Error adicional al registrar fallo en BD:`, dbError);
    }
    return false;
  }
}

/**
 * Función para limpiar y validar los datos antes de guardarlos
 * - Escapa caracteres especiales en los campos críticos
 * - Asegura que no haya direcciones duplicadas
 * - Trunca campos que podrían exceder las longitudes de columna en MySQL
 */
function cleanAndValidateData(data) {
  // 1. NO modificamos las comillas simples en denominacionDelSigno para mantener el formato original
  
  // 2. Limpiar y asegurarse que solo haya una dirección por solicitante
  if (data.solicitantesInfo && data.solicitantesInfo.length > 0 && data.solicitantesInfo[0].solicitantes) {
    data.solicitantesInfo[0].solicitantes.forEach(solicitante => {
      if (solicitante.direccion) {
        // Eliminar "Dirección Física : " del inicio
        solicitante.direccion = solicitante.direccion.replace(/^Dirección Física : /, "");
        
        // Eliminar las comillas escapadas \"...\"
        solicitante.direccion = solicitante.direccion.replace(/\\"/g, "");
        
        // Si aún hay múltiples direcciones, tomar solo la primera
        if (solicitante.direccion.includes('Dirección Física :')) {
          const direcciones = solicitante.direccion.split('Dirección Física :');
          solicitante.direccion = direcciones[0].trim();
        }
      }
    });
  }
  
  // 3. Truncar campos que podrían exceder los límites de MySQL
  if (data.refClient && data.refClient.length > 50) {
    data.refClient = data.refClient.substring(0, 50);
  }
  
  if (data.reivindicacionDeColores && data.reivindicacionDeColores.length > 1000) {
    data.reivindicacionDeColores = data.reivindicacionDeColores.substring(0, 1000);
  }
  
  // 4. Asegurarse de que los datos de clase estén bien formateados
  if (data.multiclases && data.multiclases.clasesInfo) {
    data.multiclases.clasesInfo.forEach(clase => {
      // NO modificamos las comillas simples en la descripción aquí
      // Truncar si es demasiado largo para MySQL TEXT (65535 caracteres)
      if (clase.descripcion && clase.descripcion.length > 65000) {
        clase.descripcion = clase.descripcion.substring(0, 65000);
      }
    });
  }
  
  // 5. Asegurarse de que la información de prioridad esté correctamente formateada
  if (data.prioridadInfo && data.prioridadInfo.length > 0) {
    data.prioridadInfo.forEach(prioridad => {
      if (prioridad.numeroDePrioridad && prioridad.numeroDePrioridad.length > 50) {
        prioridad.numeroDePrioridad = prioridad.numeroDePrioridad.substring(0, 50);
      }
    });
  }
  
  return data;
}

/**
 * Procesa múltiples HTMLs pendientes con control de concurrencia
 */
async function processHtmlBatch(expedientes, maxWorkers = 3) {
  const results = {
    total: expedientes.length,
    successful: 0,
    failed: 0,
    failedExpedientes: []
  };
  
  // Verificar si hay expedientes para procesar
  if (expedientes.length === 0) {
    console.log('ℹ️ No hay expedientes para procesar en este lote');
    return results;
  }
  
  // Crear lotes más pequeños para mejor gestión
  const batchSize = parseInt(process.env.BATCH_SIZE || '200');
  const batches = [];
  
  for (let i = 0; i < expedientes.length; i += batchSize) {
    batches.push(expedientes.slice(i, i + batchSize));
  }
  
  console.log(`📦 Dividiendo ${expedientes.length} expedientes en ${batches.length} lotes de ${batchSize}`);
  
  // Procesar cada lote
  let batchCounter = 1;
  for (const batch of batches) {
    console.log(`\n🔄 Procesando lote ${batchCounter} de ${batches.length} (${batch.length} expedientes)...`);
    
    // Utilizar un pool de promesas para controlar la concurrencia
    const activePromises = new Set();
    const processPromises = [];
    
    // Función para procesar un expediente con control de concurrencia
    const processWithControl = async (expediente) => {
      const promise = (async () => {
        try {
          const success = await processSingleHtml(expediente);
          
          if (success) {
            results.successful++;
          } else {
            results.failed++;
            results.failedExpedientes.push(expediente);
          }
          return { success, expediente };
        } finally {
          activePromises.delete(promise);
        }
      })();
      
      activePromises.add(promise);
      return promise;
    };
    
    // Iniciar procesamiento de expedientes con control de concurrencia
    for (const expediente of batch) {
      // Esperar si hay demasiadas promesas activas
      while (activePromises.size >= maxWorkers) {
        await Promise.race(activePromises);
        // Pequeña pausa para evitar saturación
        await randomDelay(100, 200);
      }
      
      // Procesar el siguiente expediente
      processPromises.push(processWithControl(expediente));
      
      // Pequeña pausa entre inicios para evitar sobrecarga
      await randomDelay(50, 100);
    }
    
    // Esperar a que terminen todas las promesas del lote
    await Promise.all(processPromises);
    
    // Mostrar progreso del lote
    console.log(`
      📊 Lote ${batchCounter} completado:
      - Expedientes procesados: ${batch.length}
      - Exitosos: ${results.successful}
      - Fallidos: ${results.failed}
    `);
    
    // Registrar estadísticas del lote
    try {
      await insertBatchStats(batch.length, results.successful, results.failed, batchCounter);
    } catch (error) {
      console.warn(`⚠️ No se pudieron guardar las estadísticas del lote: ${error.message}`);
    }
    
    batchCounter++;
  }
  
  return results;
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`
    ======================================================
    🔄 PROCESAMIENTO DE ARCHIVOS HTML PENDIENTES
    ======================================================
    Este script procesará los archivos HTML que ya están
    descargados pero aún no han sido convertidos a JSON
    ni insertados en la base de datos.
    ======================================================
    `);
    
    // Comprobar si existe la tabla de estadísticas
    await createStatsTableIfNotExists();
    
    // Determinar si se deben procesar expedientes fallidos
    let expedientesToProcess = [];
    let processingMode = 'pending';
    
    if (process.env.RECOVER_FAILED === 'true') {
      console.log('🔄 Modo de recuperación: obteniendo expedientes fallidos...');
      expedientesToProcess = await getFailedExpedientes(
        parseInt(process.env.RECOVERY_LIMIT || '100')
      );
      
      processingMode = 'failed';
      console.log(`📊 Se recuperarán ${expedientesToProcess.length} expedientes fallidos.`);
    } else if (process.env.PROCESS_DOWNLOADED === 'true') {
      console.log('🔄 Modo de procesamiento: obteniendo expedientes descargados...');
      expedientesToProcess = await getDownloadedExpedientes(
        parseInt(process.env.BATCH_SIZE || '100')
      );
      
      processingMode = 'downloaded';
      console.log(`📊 Se procesarán ${expedientesToProcess.length} expedientes descargados.`);
    } else {
      // Obtener lista de HTMLs pendientes
      console.log('🔄 Modo de detección: buscando HTMLs sin JSON correspondiente...');
      expedientesToProcess = await getHtmlWithoutJson();
      
      processingMode = 'html';
      console.log(`📊 Se encontraron ${expedientesToProcess.length} archivos HTML pendientes de procesar.`);
    }
    
    if (expedientesToProcess.length === 0) {
      console.log(`✅ No hay expedientes pendientes para procesar en modo ${processingMode}. Todo está al día.`);
      return;
    }
    
    // Preguntar si desea procesar todos
    if (process.env.AUTO_CONFIRM !== 'true') {
      console.log(`
      🚨 ADVERTENCIA: Este proceso puede tardar bastante tiempo para ${expedientesToProcess.length} archivos.
      Si desea continuar, presione Enter. Para cancelar, presione Ctrl+C.
      `);
      
      // Esta parte es crucial para la confirmación del usuario
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
    }
    
    // Procesar los expedientes pendientes
    const maxWorkers = parseInt(process.env.MAX_WORKERS || '3');
    console.log(`🛠️ Procesando con ${maxWorkers} workers en paralelo...`);
    
    const results = await processHtmlBatch(expedientesToProcess, maxWorkers);
    
    // Mostrar resultados finales
    console.log(`
    ======================================================
    ✅ PROCESAMIENTO COMPLETADO
    ======================================================
    
    📊 Resultados:
    - Total de expedientes procesados: ${results.total}
    - Exitosos: ${results.successful}
    - Fallidos: ${results.failed}
    
    ${results.failed > 0 ? `⚠️ Expedientes fallidos: ${results.failedExpedientes.join(', ')}` : ''}
    
    ======================================================
    `);
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

// Ejecutar función principal
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error no controlado:', error);
    process.exit(1);
  });
}

module.exports = { 
  getHtmlWithoutJson,
  processSingleHtml,
  processHtmlBatch,
  cleanAndValidateData,
  main
};