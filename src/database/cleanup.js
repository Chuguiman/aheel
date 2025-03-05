// src/database/cleanup.js
/**
 * Este módulo contiene funciones para la limpieza y optimización
 * del proceso de scraping, verificando archivos existentes y 
 * actualizando estados en la base de datos
 */
const mysql = require('mysql2/promise');
const config = require('../config/mysql.config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Obtiene todos los idsic que ya existen en la tabla sim_precarga2_sic
 * @returns {Promise<Array>} Lista de idsic ya procesados
 */
async function getExistingIdsicInPrecarga() {
  const connection = await mysql.createConnection(config);
  
  try {
    const [rows] = await connection.execute(
      'SELECT idsic FROM sim_precarga2_sic'
    );
    
    return rows.map(row => row.idsic);
  } catch (error) {
    console.error('❌ Error al consultar idsic existentes:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Obtiene la lista de archivos HTML en la carpeta origen
 * @returns {Promise<Array>} Lista de nombres de archivo (sin extensión)
 */
async function getExistingHtmlFiles() {
  try {
    const origenDir = path.join(process.cwd(), 'origen');
    const files = await fs.readdir(origenDir);
    
    return files
      .filter(file => file.endsWith('.html'))
      .map(file => path.basename(file, '.html'));
  } catch (error) {
    console.error('❌ Error al leer directorio origen:', error);
    throw error;
  }
}

/**
 * Elimina los archivos HTML de expedientes que ya existen en sim_precarga2_sic
 * @param {Array} existingIdsic - IDs que ya existen en la tabla
 * @returns {Promise<Object>} Resultados de la operación
 */
async function cleanupHtmlFiles(existingIdsic) {
  const results = {
    total: 0,
    deleted: 0,
    errors: 0,
    errorFiles: []
  };
  
  try {
    const origenDir = path.join(process.cwd(), 'origen');
    const htmlFiles = await getExistingHtmlFiles();
    
    // Convertir idsic a un Set para búsqueda más eficiente
    const existingIdsicSet = new Set(existingIdsic);
    
    // Eliminar archivos HTML de expedientes ya procesados
    for (const file of htmlFiles) {
      results.total++;
      
      if (existingIdsicSet.has(file)) {
        try {
          await fs.unlink(path.join(origenDir, `${file}.html`));
          results.deleted++;
        } catch (error) {
          console.error(`❌ Error al eliminar archivo ${file}.html:`, error);
          results.errors++;
          results.errorFiles.push(file);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error en cleanupHtmlFiles:', error);
    throw error;
  }
}

/**
 * Actualiza el estado de expedientes en scraping_gac_29k a 'DONE'
 * para aquellos que ya existen en sim_precarga2_sic
 * @param {Array} existingIdsic - IDs que ya existen en la tabla
 * @returns {Promise<number>} Número de registros actualizados
 */
async function updateExistingExpedientesStatus(existingIdsic) {
  if (existingIdsic.length === 0) {
    return 0;
  }
  
  const connection = await mysql.createConnection(config);
  
  try {
    // Preparar los placeholders para la consulta IN (...)
    const placeholders = existingIdsic.map(() => '?').join(',');
    
    // Actualizar el estado a DONE
    const [result] = await connection.execute(
      `UPDATE scraping_gac_29k 
       SET status = 'DONE' 
       WHERE idsic IN (${placeholders}) AND status != 'DONE'`,
      existingIdsic
    );
    
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error al actualizar estado de expedientes:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Actualiza el estado de expedientes que tienen HTML pero no están en sim_precarga2_sic
 * @returns {Promise<number>} Número de registros actualizados
 */
async function updatePendingHtmlStatus() {
  // Obtener IDs que ya existen en la tabla
  const existingIdsic = await getExistingIdsicInPrecarga();
  const existingIdsicSet = new Set(existingIdsic);
  
  // Obtener archivos HTML existentes
  const htmlFiles = await getExistingHtmlFiles();
  
  // Encontrar expedientes que tienen HTML pero no están en sim_precarga2_sic
  const pendingHtmlIdsic = htmlFiles.filter(file => !existingIdsicSet.has(file));
  
  if (pendingHtmlIdsic.length === 0) {
    return 0;
  }
  
  const connection = await mysql.createConnection(config);
  
  try {
    // Preparar los placeholders para la consulta IN (...)
    const placeholders = pendingHtmlIdsic.map(() => '?').join(',');
    
    // Actualizar el estado a PENDING (si no están marcados como tal)
    const [result] = await connection.execute(
      `UPDATE scraping_gac_29k 
       SET status = 'PENDING' 
       WHERE idsic IN (${placeholders}) AND (status IS NULL OR status = 'FAILED')`,
      pendingHtmlIdsic
    );
    
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error al actualizar estado de expedientes con HTML pendiente:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Sincroniza el estado de todos los expedientes basado en los archivos existentes
 * y los registros en la base de datos
 * @returns {Promise<Object>} Resultados de la sincronización
 */
async function syncDatabaseState() {
  try {
    console.log('🔄 Iniciando sincronización de estado de expedientes...');
    
    // 1. Obtener IDs que ya existen en sim_precarga2_sic
    const existingIdsic = await getExistingIdsicInPrecarga();
    console.log(`📊 Se encontraron ${existingIdsic.length} expedientes ya procesados en la tabla sim_precarga2_sic`);
    
    // 2. Eliminar archivos HTML innecesarios
    const cleanupResults = await cleanupHtmlFiles(existingIdsic);
    console.log(`🗑️ Se eliminaron ${cleanupResults.deleted} archivos HTML de expedientes ya procesados`);
    
    // 3. Actualizar estado de expedientes ya procesados
    const updatedDone = await updateExistingExpedientesStatus(existingIdsic);
    console.log(`✅ Se actualizaron ${updatedDone} expedientes a estado DONE`);
    
    // 4. Actualizar estado de expedientes con HTML pendiente
    const updatedPending = await updatePendingHtmlStatus();
    console.log(`⏳ Se actualizaron ${updatedPending} expedientes a estado PENDING`);
    
    return {
      existingCount: existingIdsic.length,
      cleanupResults,
      updatedDone,
      updatedPending
    };
  } catch (error) {
    console.error('❌ Error durante la sincronización de estado:', error);
    throw error;
  }
}

module.exports = {
  getExistingIdsicInPrecarga,
  getExistingHtmlFiles,
  cleanupHtmlFiles,
  updateExistingExpedientesStatus,
  updatePendingHtmlStatus,
  syncDatabaseState
};