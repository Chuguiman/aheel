// src/services/uploader.js
/**
 * Script para cargar archivos JSON a PostgreSQL
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const postgresDB = require('../database/postgres');

// Obtener configuración desde variables de entorno
const UPLOAD_LIMIT = parseInt(process.env.UPLOAD_LIMIT || '100');
const AUTO_CONFIRM = process.env.AUTO_CONFIRM === 'true';
const CLEANUP_AFTER_UPLOAD = process.env.CLEANUP_AFTER_UPLOAD === 'true';
const PROCESS_SPECIFIC_FILES = process.env.PROCESS_SPECIFIC_FILES === 'true';
const FILES_LIST_PATH = process.env.FILES_LIST_PATH;

/**
 * Obtiene la lista de archivos JSON disponibles para cargar
 * @returns {Promise<Array>} - Lista de archivos JSON
 */
async function getJsonFiles() {
  try {
    const jsonDir = path.join(process.cwd(), 'json');
    console.log(`📂 Buscando archivos JSON en: ${jsonDir}`);
    
    // Si debemos procesar archivos específicos desde un archivo
    if (PROCESS_SPECIFIC_FILES && FILES_LIST_PATH) {
      try {
        console.log(`🔍 Cargando lista de archivos específicos desde: ${FILES_LIST_PATH}`);
        const fileContent = await fs.readFile(FILES_LIST_PATH, 'utf8');
        const fileList = JSON.parse(fileContent);
        
        console.log(`📋 Lista cargada con ${fileList.length} archivos para procesar`);
        
        // Verificar que los archivos existen
        const validFiles = [];
        for (const file of fileList) {
          try {
            await fs.access(path.join(jsonDir, file));
            validFiles.push(file);
          } catch (error) {
            console.warn(`⚠️ Archivo no encontrado: ${file}`);
          }
        }
        
        console.log(`📊 Se procesarán ${validFiles.length} archivos JSON de la lista`);
        return validFiles;
      } catch (error) {
        console.error(`❌ Error al cargar lista de archivos: ${error.message}`);
        console.log(`⚠️ Continuando con el procesamiento normal de archivos JSON`);
      }
    }
    
    // Procesamiento normal (todos los archivos)
    const allFiles = await fs.readdir(jsonDir);
    const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
    
    console.log(`📊 Se encontraron ${jsonFiles.length} archivos JSON`);
    
    // Mostrar algunos ejemplos para depuración
    if (jsonFiles.length > 0) {
      console.log(`🔍 Primeros 5 archivos JSON: ${jsonFiles.slice(0, 5).join(', ')}`);
    }
    
    return jsonFiles;
  } catch (error) {
    console.error('❌ Error al obtener archivos JSON:', error);
    throw error;
  }
}

/**
 * Carga un archivo JSON a PostgreSQL
 * @param {string} jsonFile - Nombre del archivo JSON
 * @returns {Promise<boolean>} - true si se cargó correctamente
 */
async function uploadJsonToPostgres(jsonFile) {
  try {
    // Obtener el ID del expediente desde el nombre del archivo
    const idsic = path.basename(jsonFile, '.json');
    console.log(`🔍 Procesando expediente: ${idsic}`);
    
    // Ruta completa al archivo JSON
    const jsonPath = path.join(process.cwd(), 'json', jsonFile);
    
    // Leer el archivo JSON
    const jsonData = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(jsonData);
    
    // Utilizar el módulo postgresDB existente para insertar el expediente
    const success = await postgresDB.insertExpediente(data);
    
    if (success) {
      console.log(`✅ Expediente ${idsic} cargado exitosamente en PostgreSQL`);
      
      // Eliminar archivo JSON si está configurado
      if (CLEANUP_AFTER_UPLOAD) {
        await fs.unlink(jsonPath);
        console.log(`🗑️ Archivo JSON eliminado: ${jsonFile}`);
      }
    } else {
      console.error(`❌ Error al cargar expediente ${idsic} a PostgreSQL`);
    }
    
    return success;
  } catch (error) {
    console.error(`❌ Error al procesar archivo JSON ${jsonFile}:`, error);
    return false;
  }
}

/**
 * Procesa y carga varios archivos JSON a PostgreSQL
 * @param {Array} jsonFiles - Lista de archivos JSON
 * @param {number} limit - Límite de archivos a procesar
 * @returns {Promise<Object>} - Resultados del procesamiento
 */
async function processJsonFiles(jsonFiles, limit) {
  // Inicializar pool de conexión PostgreSQL
  postgresDB.getPool();
  
  // Limitar cantidad de archivos a procesar
  const filesToProcess = jsonFiles.slice(0, limit);
  
  const results = {
    total: filesToProcess.length,
    successful: 0,
    failed: 0,
    failedFiles: []
  };
  
  // Procesar cada archivo
  for (const jsonFile of filesToProcess) {
    try {
      const success = await uploadJsonToPostgres(jsonFile);
      
      if (success) {
        results.successful++;
      } else {
        results.failed++;
        results.failedFiles.push(jsonFile);
      }
    } catch (error) {
      console.error(`❌ Error no controlado al procesar ${jsonFile}:`, error);
      results.failed++;
      results.failedFiles.push(jsonFile);
    }
  }
  
  // Cerrar la conexión
  await postgresDB.closePool();
  
  return results;
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`
    ======================================================
    📤 CARGA DE ARCHIVOS JSON A POSTGRESQL
    ======================================================
    Este script procesará archivos JSON y los cargará
    en la base de datos PostgreSQL.
    ======================================================
    `);
    
    // Obtener lista de archivos JSON
    const jsonFiles = await getJsonFiles();
    
    if (jsonFiles.length === 0) {
      console.log('ℹ️ No hay archivos JSON para procesar.');
      return;
    }
    
    // Mostrar límite de procesamiento
    const filesToProcess = Math.min(jsonFiles.length, UPLOAD_LIMIT);
    console.log(`📊 Se procesarán ${filesToProcess} de ${jsonFiles.length} archivos JSON.`);
    
    // Preguntar si desea procesar todos
    if (!AUTO_CONFIRM) {
      console.log(`
      🚨 ADVERTENCIA: Este proceso cargará ${filesToProcess} archivos JSON a PostgreSQL.
      ${CLEANUP_AFTER_UPLOAD ? 'Los archivos JSON serán eliminados después de la carga.' : ''}
      Si desea continuar, presione Enter. Para cancelar, presione Ctrl+C.
      `);
      
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
    } else {
      console.log(`🔄 Confirmación automática activada, continuando sin esperar...`);
    }
    
    // Procesar archivos JSON
    const results = await processJsonFiles(jsonFiles, filesToProcess);
    
    // Mostrar resultados finales
    console.log(`
    ======================================================
    ✅ CARGA A POSTGRESQL COMPLETADA
    ======================================================
    
    📊 Resultados:
    - Total de archivos procesados: ${results.total}
    - Exitosos: ${results.successful}
    - Fallidos: ${results.failed}
    
    ${results.failed > 0 ? `⚠️ Archivos fallidos: ${results.failedFiles.join(', ')}` : ''}
    
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
  getJsonFiles,
  uploadJsonToPostgres,
  processJsonFiles,
  main
};