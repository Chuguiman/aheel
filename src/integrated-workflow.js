// src/integrated-workflow.js
/**
 * Script integrado para el proceso completo de scraping, procesamiento y carga
 * 
 * Este script ejecuta los siguientes pasos en secuencia:
 * 1. Descarga de expedientes HTML (download-expedientes.js)
 * 2. Procesamiento de HTML a JSON y carga en MySQL (process-html-to-json.js)
 * 3. Carga de JSON a PostgreSQL (services/uploader.js)
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Variable para rastrear los archivos procesados
let processedFiles = [];

// Configuración por defecto
// NOTA: Ahora obtenemos los valores directamente de process.env
function getConfig() {
  return {
    downloadLimit: parseInt(process.argv.includes('--downloadLimit') 
      ? process.argv[process.argv.indexOf('--downloadLimit') + 1] 
      : (process.env.DOWNLOAD_LIMIT || '10')),
      
    processLimit: parseInt(process.argv.includes('--processLimit') 
      ? process.argv[process.argv.indexOf('--processLimit') + 1] 
      : (process.env.PROCESS_LIMIT || '100')),
      
    uploadLimit: parseInt(process.argv.includes('--uploadLimit') 
      ? process.argv[process.argv.indexOf('--uploadLimit') + 1] 
      : (process.env.UPLOAD_LIMIT || '100')),
      
    maxWorkers: parseInt(process.argv.includes('--maxWorkers') 
      ? process.argv[process.argv.indexOf('--maxWorkers') + 1] 
      : (process.env.MAX_WORKERS || '3')),
      
    autoConfirm: process.argv.includes('--autoConfirm=true') 
      ? true 
      : (process.env.AUTO_CONFIRM === 'true'),
      
    cleanupAfterUpload: process.argv.includes('--cleanupAfterUpload=true') 
      ? true 
      : (process.env.CLEANUP_AFTER_UPLOAD === 'true')
  };
}

/**
 * Ejecuta un script Node.js como proceso independiente
 * @param {string} scriptPath - Ruta al script
 * @param {Object} envVars - Variables de entorno adicionales
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>} - Resultado de la ejecución
 */
function executeScript(scriptPath, envVars = {}) {
  return new Promise((resolve, reject) => {
    // Preparar variables de entorno
    const env = { ...process.env, ...envVars };
    
    // Ejecutar el script
    console.log(`🚀 Ejecutando: ${scriptPath}`);
    const child = spawn('node', [scriptPath], { 
      env,
      stdio: ['inherit', 'pipe', 'pipe'] // Permitir entrada pero capturar salida
    });
    
    let stdout = '';
    let stderr = '';
    
    // Capturar salida estándar
    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // Reenviar salida al proceso principal
      process.stdout.write(output);
    });
    
    // Capturar errores
    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // Reenviar salida de error al proceso principal
      process.stderr.write(output);
    });
    
    // Manejar finalización del proceso
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ exitCode: code, stdout, stderr });
      } else {
        console.error(`Script ${path.basename(scriptPath)} falló con código ${code}`);
        reject(new Error(`Script ${path.basename(scriptPath)} falló con código ${code}`));
      }
    });
    
    // Manejar errores del proceso
    child.on('error', (error) => {
      console.error(`Error al ejecutar ${scriptPath}: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Paso 1: Descarga expedientes HTML
 * @param {number} limit - Límite de expedientes a descargar
 * @param {boolean} autoConfirm - Confirmar automáticamente
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function downloadExpedientes(limit, autoConfirm) {
  try {
    console.log(`
    ======================================================
    🌐 PASO 1: DESCARGA DE EXPEDIENTES HTML
    ======================================================
    Límite: ${limit} expedientes
    Confirmación automática: ${autoConfirm ? 'Sí' : 'No'}
    ======================================================
    `);
    
    const scriptPath = path.join(process.cwd(), 'src', 'download-expedientes.js');
    
    // Preparar variables de entorno
    const envVars = {
      DOWNLOAD_LIMIT: limit.toString(),
      AUTO_CONFIRM: autoConfirm.toString()
    };
    
    console.log(`Ejecutando download-expedientes.js con DOWNLOAD_LIMIT=${limit} y AUTO_CONFIRM=${autoConfirm}`);
    
    // Ejecutar script de descarga
    const result = await executeScript(scriptPath, envVars);
    
    console.log(`
    ======================================================
    ✅ DESCARGA COMPLETADA
    ======================================================
    `);
    
    return { success: true, details: result };
  } catch (error) {
    console.error(`❌ Error durante la descarga de expedientes:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Captura los archivos JSON generados antes del procesamiento
 * para poder determinar cuáles son nuevos después
 */
async function captureInitialJsonFiles() {
  try {
    const jsonDir = path.join(process.cwd(), 'json');
    
    // Asegurarse de que el directorio existe
    try {
      await fs.mkdir(jsonDir, { recursive: true });
    } catch (error) {
      // Ignorar error si el directorio ya existe
    }
    
    const files = await fs.readdir(jsonDir);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('❌ Error al capturar archivos JSON iniciales:', error);
    return [];
  }
}

/**
 * Identifica los archivos JSON nuevos comparando con la lista inicial
 */
async function identifyNewJsonFiles(initialFiles) {
  try {
    const jsonDir = path.join(process.cwd(), 'json');
    const currentFiles = await fs.readdir(jsonDir);
    const jsonFiles = currentFiles.filter(file => file.endsWith('.json'));
    
    // Encontrar archivos que no estaban en la lista inicial
    const newFiles = jsonFiles.filter(file => !initialFiles.includes(file));
    
    console.log(`📊 Se encontraron ${newFiles.length} archivos JSON nuevos`);
    
    // Guardar para su uso posterior
    processedFiles = newFiles;
    
    return newFiles;
  } catch (error) {
    console.error('❌ Error al identificar archivos JSON nuevos:', error);
    return [];
  }
}

/**
 * Crea un archivo temporal con la lista de archivos JSON a procesar
 * @param {Array} jsonFiles - Lista de archivos JSON
 * @returns {Promise<string>} - Ruta al archivo temporal
 */
async function createFilesList(jsonFiles) {
  try {
    const tempFile = path.join(process.cwd(), 'tmp_files_list.json');
    await fs.writeFile(tempFile, JSON.stringify(jsonFiles));
    console.log(`📄 Lista de archivos creada en: ${tempFile}`);
    return tempFile;
  } catch (error) {
    console.error('❌ Error al crear lista de archivos:', error);
    throw error;
  }
}

/**
 * Paso 2: Procesa HTML a JSON y carga en MySQL
 * @param {number} limit - Límite de expedientes a procesar
 * @param {number} maxWorkers - Número máximo de trabajadores en paralelo
 * @param {boolean} autoConfirm - Confirmar automáticamente
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function processHtmlToJson(limit, maxWorkers, autoConfirm) {
  try {
    console.log(`
    ======================================================
    🔄 PASO 2: PROCESAMIENTO HTML A JSON Y CARGA EN MYSQL
    ======================================================
    Límite: ${limit} expedientes
    Workers: ${maxWorkers}
    Confirmación automática: ${autoConfirm ? 'Sí' : 'No'}
    ======================================================
    `);
    
    // Capturar archivos JSON antes del procesamiento
    const initialJsonFiles = await captureInitialJsonFiles();
    console.log(`📊 Archivos JSON existentes antes del procesamiento: ${initialJsonFiles.length}`);
    
    const scriptPath = path.join(process.cwd(), 'src', 'process-html-to-json.js');
    
    // Preparar variables de entorno para el procesamiento
    const envVars = {
      BATCH_SIZE: limit.toString(),
      MAX_WORKERS: maxWorkers.toString(),
      AUTO_CONFIRM: autoConfirm.toString(),
      // Asegurar que no está en modo de recuperación
      RECOVER_FAILED: 'false',
      PROCESS_DOWNLOADED: 'false'
    };
    
    console.log(`Ejecutando process-html-to-json.js con BATCH_SIZE=${limit}, MAX_WORKERS=${maxWorkers}, AUTO_CONFIRM=${autoConfirm}`);
    
    // Ejecutar script de procesamiento
    const result = await executeScript(scriptPath, envVars);
    
    console.log(`
    ======================================================
    ✅ PROCESAMIENTO HTML COMPLETADO
    ======================================================
    `);
    
    // Identificar los archivos JSON nuevos
    const newFiles = await identifyNewJsonFiles(initialJsonFiles);
    
    return { success: true, details: result, newFiles };
  } catch (error) {
    console.error(`❌ Error durante el procesamiento HTML a JSON:`, error);
    return { success: false, error: error.message, newFiles: [] };
  }
}

/**
 * Paso 3: Carga JSON a PostgreSQL
 * @param {number} limit - Límite de archivos JSON a cargar
 * @param {boolean} autoConfirm - Confirmar automáticamente
 * @param {boolean} cleanup - Eliminar JSONs después de cargar
 * @param {Array} specificFiles - Lista específica de archivos a procesar (opcional)
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function uploadJsonToPostgres(limit, autoConfirm, cleanup, specificFiles = []) {
  try {
    console.log(`
    ======================================================
    📤 PASO 3: CARGA DE JSON A POSTGRESQL
    ======================================================
    Límite: ${limit} archivos
    Confirmación automática: ${autoConfirm ? 'Sí' : 'No'}
    Limpieza después de carga: ${cleanup ? 'Sí' : 'No'}
    Archivos específicos: ${specificFiles.length} archivos
    ======================================================
    `);
    
    // Log the path being checked
    const scriptPath = path.join(process.cwd(), 'src', 'services', 'uploader.js');
    console.log(`🔍 Buscando script uploader en: ${scriptPath}`);
    
    // Check if the script exists
    try {
      await fs.access(scriptPath);
      console.log(`✅ Script uploader encontrado en: ${scriptPath}`);
    } catch (error) {
      console.error(`❌ Error: Script uploader no encontrado en ${scriptPath}. Error: ${error.message}`);
      throw new Error(`Script uploader.js no encontrado en ${scriptPath}. Error: ${error.message}`);
    }
    
    // Si se proporcionaron archivos específicos o se identificaron archivos nuevos, crear un archivo temporal con la lista
    let filesListPath = null;
    if (specificFiles.length > 0) {
      filesListPath = await createFilesList(specificFiles);
      console.log(`📋 Se procesarán ${specificFiles.length} archivos JSON específicos`);
    } else if (processedFiles.length > 0) {
      filesListPath = await createFilesList(processedFiles);
      console.log(`📋 Se procesarán ${processedFiles.length} archivos JSON nuevos identificados en el paso 2`);
    } else {
      console.log(`⚠️ No se encontraron archivos JSON nuevos para cargar a PostgreSQL, procesando todos los disponibles`);
    }
    
    // Preparar variables de entorno para la carga
    const envVars = {
      UPLOAD_LIMIT: limit.toString(),
      AUTO_CONFIRM: 'true', // Forzar confirmación automática
      CLEANUP_AFTER_UPLOAD: cleanup.toString()
    };
    
    // Añadir la configuración de archivos específicos si existe
    if (filesListPath) {
      envVars.PROCESS_SPECIFIC_FILES = 'true';
      envVars.FILES_LIST_PATH = filesListPath;
    }
    
    console.log(`Ejecutando uploader.js con UPLOAD_LIMIT=${limit} y AUTO_CONFIRM=true`);
    
    // Ejecutar script de carga
    const result = await executeScript(scriptPath, envVars);
    
    // Limpiar archivo temporal
    try {
      if (filesListPath) {
        await fs.unlink(filesListPath);
        console.log(`🗑️ Archivo temporal de lista eliminado`);
      }
    } catch (cleanupError) {
      console.warn(`⚠️ No se pudo eliminar el archivo temporal: ${cleanupError.message}`);
    }
    
    console.log(`
    ======================================================
    ✅ CARGA A POSTGRESQL COMPLETADA
    ======================================================
    `);
    
    return { success: true, details: result };
  } catch (error) {
    console.error(`❌ Error durante la carga a PostgreSQL:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Función principal que ejecuta todo el flujo de trabajo
 */
async function executeIntegratedWorkflow() {
  // Obtener la configuración
  const workflowConfig = getConfig();
  
  try {
    console.log(`
    ======================================================
    🚀 INICIANDO FLUJO DE TRABAJO INTEGRADO
    ======================================================
    Configuración:
    - Límite de descarga: ${workflowConfig.downloadLimit} expedientes
    - Límite de procesamiento: ${workflowConfig.processLimit} archivos
    - Límite de carga a PostgreSQL: ${workflowConfig.uploadLimit} archivos
    - Trabajadores en paralelo: ${workflowConfig.maxWorkers}
    - Confirmación automática: ${workflowConfig.autoConfirm ? 'Sí' : 'No'}
    - Limpieza después de carga: ${workflowConfig.cleanupAfterUpload ? 'Sí' : 'No'}
    ======================================================
    `);
    
    // Paso 1: Descargar expedientes
    const downloadResult = await downloadExpedientes(
      workflowConfig.downloadLimit,
      workflowConfig.autoConfirm
    );
    
    console.log("✅ Paso 1 (Descarga) completado. Iniciando paso 2...");
    
    if (!downloadResult.success) {
      console.error('⚠️ La descarga de expedientes falló. Continuando con el siguiente paso...');
    }
    
    // Paso 2: Procesar HTML a JSON
    const processResult = await processHtmlToJson(
      workflowConfig.processLimit,
      workflowConfig.maxWorkers,
      workflowConfig.autoConfirm
    );
    
    console.log("✅ Paso 2 (Procesamiento HTML) completado. Iniciando paso 3...");
    
    if (!processResult.success) {
      console.error('⚠️ El procesamiento HTML a JSON falló. Continuando con el siguiente paso...');
    }
    
    // Paso 3: Cargar JSON a PostgreSQL - usar archivos nuevos identificados en paso 2
    const uploadResult = await uploadJsonToPostgres(
      workflowConfig.uploadLimit,
      workflowConfig.autoConfirm,
      workflowConfig.cleanupAfterUpload,
      processResult.newFiles || []
    );
    
    if (!uploadResult.success) {
      console.error('⚠️ La carga a PostgreSQL falló.');
    }
    
    // Resultados finales
    console.log(`
    ======================================================
    🏁 FLUJO DE TRABAJO INTEGRADO COMPLETADO
    ======================================================
    Resultados:
    - Descarga: ${downloadResult.success ? '✅ Exitosa' : '❌ Fallida'}
    - Procesamiento HTML: ${processResult.success ? '✅ Exitoso' : '❌ Fallido'}
    - Carga a PostgreSQL: ${uploadResult.success ? '✅ Exitosa' : '❌ Fallida'}
    ======================================================
    `);
    
    return {
      overallSuccess: downloadResult.success && processResult.success && uploadResult.success,
      steps: {
        download: downloadResult,
        process: processResult,
        upload: uploadResult
      }
    };
  } catch (error) {
    console.error('❌ Error durante la ejecución del flujo de trabajo:', error);
    process.exit(1);
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  // Ejecutar con la configuración obtenida directamente de las variables de entorno o args
  executeIntegratedWorkflow().catch(error => {
    console.error('❌ Error no controlado:', error);
    process.exit(1);
  });
}

module.exports = {
  executeIntegratedWorkflow,
  downloadExpedientes,
  processHtmlToJson,
  uploadJsonToPostgres
};