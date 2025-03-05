    // src/cleanup-script.js
/**
 * Script independiente para limpiar y sincronizar el estado del sistema
 * de scraping basado en los registros existentes
 */
require('dotenv').config();
const cleanup = require('./database/cleanup');
const fs = require('fs').promises;
const path = require('path');

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`
    ======================================================
    🧹 LIMPIEZA Y SINCRONIZACIÓN DEL SISTEMA DE SCRAPING
    ======================================================
    Este script realizará las siguientes tareas:
    
    1. Verificar expedientes ya procesados en sim_precarga2_sic
    2. Eliminar HTML innecesarios de expedientes ya procesados
    3. Actualizar el estado de los expedientes en scraping_gac_29k
    4. Identificar expedientes con HTML pendientes de procesar
    ======================================================
    `);
    
    // Asegurar que existen los directorios necesarios
    await setupDirectories();
    
    // Ejecutar la sincronización
    const results = await cleanup.syncDatabaseState();
    
    // Mostrar resumen de resultados
    console.log(`
    ======================================================
    ✅ SINCRONIZACIÓN COMPLETADA
    ======================================================
    
    📊 Resumen:
    
    - ${results.existingCount} expedientes ya existentes en sim_precarga2_sic
    - ${results.cleanupResults.deleted} archivos HTML innecesarios eliminados
    - ${results.updatedDone} expedientes actualizados a estado DONE
    - ${results.updatedPending} expedientes con HTML pendientes de procesar
    
    📋 Próximos pasos:
    
    1. Para procesar los expedientes pendientes, ejecute:
       node src/main-batch-processor.js
       
    2. Para visualizar estadísticas detalladas:
       node src/stats.js
    ======================================================
    `);
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

/**
 * Verifica y crea los directorios necesarios
 */
async function setupDirectories() {
  const directories = ['origen', 'json', 'media'];
  
  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✅ Directorio verificado: ${dir}`);
    } catch (error) {
      console.error(`❌ Error al verificar directorio ${dir}:`, error);
    }
  }
}

/**
 * Ejecuta una verificación rápida del estado del sistema
 */
async function checkSystemState() {
  try {
    // Obtener expedientes existentes
    const existingIdsic = await cleanup.getExistingIdsicInPrecarga();
    
    // Obtener archivos HTML
    const htmlFiles = await cleanup.getExistingHtmlFiles();
    
    // Calcular pendientes
    const existingSet = new Set(existingIdsic);
    const pendingHtml = htmlFiles.filter(file => !existingSet.has(file));
    
    console.log(`
    ======================================================
    📊 ESTADO DEL SISTEMA
    ======================================================
    
    - ${existingIdsic.length} expedientes ya procesados en sim_precarga2_sic
    - ${htmlFiles.length} archivos HTML en carpeta origen
    - ${pendingHtml.length} expedientes con HTML pendientes de procesar
    
    ======================================================
    `);
    
    return {
      existingCount: existingIdsic.length,
      htmlCount: htmlFiles.length,
      pendingCount: pendingHtml.length
    };
  } catch (error) {
    console.error('❌ Error al verificar estado del sistema:', error);
    throw error;
  }
}

// Ejecutar la función principal o la verificación según argumentos
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'check') {
    checkSystemState().catch(error => {
      console.error('❌ Error no controlado:', error);
      process.exit(1);
    });
  } else {
    main().catch(error => {
      console.error('❌ Error no controlado:', error);
      process.exit(1);
    });
  }
}

module.exports = {
  main,
  checkSystemState
};