// src/services/uploader.js
const fs = require('fs').promises;
const path = require('path');
const mysqlDB = require('../database/mysql');
const postgresDB = require('../database/postgres');

/**
 * Carga datos de un expediente desde un archivo JSON
 * @param {string} expediente - Identificador del expediente
 * @returns {Promise<Object>} Datos del expediente
 */
async function loadExpedienteData(expediente) {
  try {
    const filePath = path.join('json', `${expediente}.json`);
    const jsonData = await fs.readFile(filePath, 'utf8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`❌ Error al cargar datos JSON para ${expediente}:`, error);
    throw error;
  }
}

/**
 * Procesa un expediente y lo sube a las bases de datos
 * @param {string} expediente - Identificador del expediente
 * @param {Object} options - Opciones de procesamiento
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function processAndUploadExpediente(expediente, options = {}) {
  const result = {
    expediente,
    mysql: { success: false, message: '' },
    postgres: { success: false, message: '' }
  };

  try {
    // Cargar datos del expediente
    const data = await loadExpedienteData(expediente);
    
    // Subir a MySQL si está habilitado
    if (options.mysql !== false) {
      try {
        const mysqlResult = await mysqlDB.insertExpediente(data);
        result.mysql = {
          success: mysqlResult === 'success',
          message: mysqlResult === 'success' 
            ? 'Datos insertados con éxito en MySQL' 
            : 'Error al insertar en MySQL'
        };
      } catch (error) {
        result.mysql = {
          success: false,
          message: `Error al insertar en MySQL: ${error.message}`
        };
      }
    }
    
    // Subir a PostgreSQL si está habilitado
    if (options.postgres !== false) {
      try {
        const pgResult = await postgresDB.insertExpediente(data);
        result.postgres = {
          success: pgResult,
          message: pgResult 
            ? 'Datos insertados con éxito en PostgreSQL' 
            : 'Error al insertar en PostgreSQL'
        };
      } catch (error) {
        result.postgres = {
          success: false,
          message: `Error al insertar en PostgreSQL: ${error.message}`
        };
      }
    }
    
    // Eliminar archivos HTML si es necesario
    if (options.deleteHtml && (result.mysql.success || result.postgres.success)) {
      try {
        const htmlFilePath = path.join('origen', `${expediente}.html`);
        await fs.unlink(htmlFilePath);
        console.log(`🗑️ Archivo HTML eliminado: ${htmlFilePath}`);
      } catch (error) {
        console.error(`⚠️ No se pudo eliminar el archivo HTML: ${error.message}`);
      }
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error al procesar y subir expediente ${expediente}:`, error);
    return {
      expediente,
      mysql: { success: false, message: `Error general: ${error.message}` },
      postgres: { success: false, message: `Error general: ${error.message}` }
    };
  }
}

/**
 * Procesa y sube múltiples expedientes a las bases de datos
 * @param {Array} expedientes - Lista de identificadores de expedientes
 * @param {Object} options - Opciones de procesamiento
 * @returns {Promise<Object>} Resultados del procesamiento
 */
async function processAndUploadExpedientes(expedientes, options = {}) {
  const results = {
    total: expedientes.length,
    success: 0,
    failed: 0,
    mysqlSuccess: 0,
    postgresSuccess: 0,
    failedExpedientes: []
  };
  
  for (const expediente of expedientes) {
    console.log(`⏳ Procesando expediente: ${expediente}`);
    const result = await processAndUploadExpediente(expediente, options);
    
    if (result.mysql.success || result.postgres.success) {
      results.success++;
      if (result.mysql.success) results.mysqlSuccess++;
      if (result.postgres.success) results.postgresSuccess++;
    } else {
      results.failed++;
      results.failedExpedientes.push(expediente);
    }
  }
  
  return results;
}

module.exports = {
  loadExpedienteData,
  processAndUploadExpediente,
  processAndUploadExpedientes
};