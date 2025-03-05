// src/stats.js
/**
 * Script para generar estadísticas detalladas del sistema de scraping
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./config/mysql.config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Obtiene estadísticas del sistema de scraping
 */
async function getStats() {
  const connection = await mysql.createConnection(config);
  
  try {
    const stats = {};
    
    // 1. Estadísticas de scraping_gac_29k
    const [scrapingStats] = await connection.execute(`
      SELECT
        status,
        COUNT(*) as count
      FROM scraping_gac_29k
      GROUP BY status
      ORDER BY
        CASE
          WHEN status = 'PENDING' THEN 1
          WHEN status = 'PROCESSING' THEN 2
          WHEN status = 'DONE' THEN 3
          WHEN status = 'FAILED' THEN 4
          ELSE 5
        END
    `);
    
    stats.scraping = scrapingStats;
    
    // 2. Estadísticas de sim_precarga2_sic
    const [precargaStats] = await connection.execute(`
      SELECT COUNT(*) as total FROM sim_precarga2_sic
    `);
    
    stats.precarga = {
      total: precargaStats[0].total
    };
    
    // 3. Estadísticas por estado
    const [estadoStats] = await connection.execute(`
      SELECT
        estado,
        COUNT(*) as count
      FROM sim_precarga2_sic
      GROUP BY estado
      ORDER BY count DESC
    `);
    
    stats.estados = estadoStats;
    
    // 4. Estadísticas de archivos
    const origenDir = path.join(process.cwd(), 'origen');
    const jsonDir = path.join(process.cwd(), 'json');
    const mediaDir = path.join(process.cwd(), 'media');
    
    try {
      const origenFiles = await fs.readdir(origenDir);
      const jsonFiles = await fs.readdir(jsonDir);
      const mediaFiles = await fs.readdir(mediaDir);
      
      stats.files = {
        origen: origenFiles.filter(f => f.endsWith('.html')).length,
        json: jsonFiles.filter(f => f.endsWith('.json')).length,
        media: mediaFiles.length
      };
    } catch (error) {
      stats.files = {
        error: 'Error al leer directorios',
        message: error.message
      };
    }
    
    // 5. Últimos 5 expedientes fallidos
    const [lastFailures] = await connection.execute(`
      SELECT 
        f.expediente, 
        f.error_msg,
        f.attempt,
        f.created_at
      FROM failed_responses f
      ORDER BY f.created_at DESC
      LIMIT 5
    `);
    
    stats.lastFailures = lastFailures;
    
    // 6. Estadísticas de procesamiento
    const [processingStats] = await connection.execute(`
      SELECT
        batch_id,
        total_expedientes,
        successful_expedientes,
        failed_expedientes,
        start_time,
        end_time,
        TIMESTAMPDIFF(SECOND, start_time, IFNULL(end_time, NOW())) as duration_seconds
      FROM processing_stats
      ORDER BY batch_id DESC
      LIMIT 10
    `);
    
    stats.processing = processingStats;
    
    return stats;
  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Función principal que muestra estadísticas
 */
async function main() {
  try {
    console.log(`
    ======================================================
    📊 ESTADÍSTICAS DEL SISTEMA DE SCRAPING
    ======================================================
    `);
    
    const stats = await getStats();
    
    // Mostrar estadísticas de scraping_gac_29k
    console.log('ESTADO DE EXPEDIENTES (scraping_gac_29k):');
    console.log('----------------------------------------');
    
    let totalExpedientes = 0;
    stats.scraping.forEach(stat => {
      console.log(`${stat.status || 'SIN ESTADO'}: ${stat.count} expedientes`);
      totalExpedientes += stat.count;
    });
    console.log(`TOTAL: ${totalExpedientes} expedientes`);
    console.log();
    
    // Mostrar estadísticas de sim_precarga2_sic
    console.log('EXPEDIENTES PROCESADOS (sim_precarga2_sic):');
    console.log('------------------------------------------');
    console.log(`Total: ${stats.precarga.total} expedientes`);
    console.log();
    
    // Mostrar estadísticas por estado
    console.log('DISTRIBUCIÓN POR ESTADO:');
    console.log('----------------------');
    stats.estados.forEach(stat => {
      console.log(`${stat.estado || 'SIN ESTADO'}: ${stat.count} expedientes`);
    });
    console.log();
    
    // Mostrar estadísticas de archivos
    console.log('ARCHIVOS EN EL SISTEMA:');
    console.log('---------------------');
    if (stats.files.error) {
      console.log(`Error: ${stats.files.message}`);
    } else {
      console.log(`HTML en "origen": ${stats.files.origen} archivos`);
      console.log(`JSON en "json": ${stats.files.json} archivos`);
      console.log(`Multimedia en "media": ${stats.files.media} archivos`);
    }
    console.log();
    
    // Mostrar últimos fallos
    console.log('ÚLTIMOS ERRORES:');
    console.log('--------------');
    if (stats.lastFailures.length === 0) {
      console.log('No hay errores recientes');
    } else {
      stats.lastFailures.forEach(failure => {
        console.log(`Expediente: ${failure.expediente}`);
        console.log(`Error: ${failure.error_msg}`);
        console.log(`Fecha: ${failure.created_at}`);
        console.log(`Intento: ${failure.attempt}`);
        console.log('---');
      });
    }
    console.log();
    
    // Mostrar estadísticas de procesamiento
    console.log('ÚLTIMOS LOTES PROCESADOS:');
    console.log('------------------------');
    if (stats.processing.length === 0) {
      console.log('No hay información de lotes procesados');
    } else {
      stats.processing.forEach(batch => {
        console.log(`Lote #${batch.batch_id}:`);
        console.log(`  Total: ${batch.total_expedientes} expedientes`);
        console.log(`  Exitosos: ${batch.successful_expedientes} expedientes`);
        console.log(`  Fallidos: ${batch.failed_expedientes} expedientes`);
        console.log(`  Duración: ${formatDuration(batch.duration_seconds)}`);
        console.log('---');
      });
    }
    
    console.log(`
    ======================================================
    `);
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

/**
 * Formatea segundos a formato legible (hh:mm:ss)
 * @param {number} seconds - Segundos
 * @returns {string} Tiempo formateado
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
}

/**
 * Añade cero a la izquierda si es necesario
 * @param {number} num - Número
 * @returns {string} Número con cero a la izquierda si es necesario
 */
function padZero(num) {
  return num.toString().padStart(2, '0');
}

// Ejecutar la función principal
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error no controlado:', error);
    process.exit(1);
  });
}

module.exports = {
  getStats
};