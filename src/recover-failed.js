// src/recover-failed.js
/**
 * Script para recuperar expedientes fallidos
 * y verificar la integridad de los datos
 */
require('dotenv').config();
const recovery = require('./services/recovery');
const mysql = require('mysql2/promise');
const config = require('./config/mysql.config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`
    ======================================================
    🔁 RECUPERACIÓN DE EXPEDIENTES FALLIDOS
    ======================================================
    Este script intentará recuperar expedientes que han fallado
    durante el procesamiento, verificando HTML, JSON y multimedia.
    ======================================================
    `);
    
    // Solicitar confirmación
    if (process.env.AUTO_CONFIRM !== 'true') {
      console.log(`
      Este proceso intentará recuperar expedientes fallidos.
      Si desea continuar, presione Enter. Para cancelar, presione Ctrl+C.
      `);
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
    }
    
    // Recuperar expedientes fallidos
    const limit = parseInt(process.argv[2] || process.env.RECOVERY_LIMIT || '100');
    console.log(`🔄 Intentando recuperar hasta ${limit} expedientes fallidos...`);
    
    const results = await recovery.recoverFailedExpedientes(limit);
    
    // Mostrar resultados
    console.log(`
    ======================================================
    ✅ PROCESO DE RECUPERACIÓN COMPLETADO
    ======================================================
    
    📊 Resultados:
    - Total de expedientes analizados: ${results.total}
    - Expedientes recuperados con éxito: ${results.recovered}
    - Expedientes que no se pudieron recuperar: ${results.failed}
    
    ======================================================
    `);
    
    // Mostrar detalles de los expedientes recuperados
    if (results.recovered > 0) {
      console.log('EXPEDIENTES RECUPERADOS EXITOSAMENTE:');
      results.details
        .filter(detail => detail.success)
        .forEach(detail => {
          console.log(`- ${detail.expediente}: ${detail.actions.join(' → ')}`);
        });
      console.log();
    }
    
    // Mostrar detalles de los expedientes fallidos
    if (results.failed > 0) {
      console.log('EXPEDIENTES QUE NO SE PUDIERON RECUPERAR:');
      results.details
        .filter(detail => !detail.success)
        .forEach(detail => {
          console.log(`- ${detail.expediente}`);
          console.log(`  Errores: ${detail.errors.join(', ')}`);
          console.log(`  Acciones realizadas: ${detail.actions.join(', ')}`);
        });
      console.log();
    }
    
    // Sugerencias finales
    console.log('PRÓXIMOS PASOS RECOMENDADOS:');
    if (results.recovered > 0) {
      console.log('1. Verifique el sistema con: node src/system-check.js');
    }
    if (results.failed > 0) {
      console.log('2. Para los expedientes que no se pudieron recuperar, considere:');
      console.log('   - Volver a descargar el HTML: node src/main-batch-processor.js retry');
      console.log('   - Comprobar si hay archivos multimedia faltantes: node src/media-converter.js');
    }
    console.log();
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

/**
 * Vuelve a procesar un único expediente específico
 */
async function recoverSingleExpediente(expediente) {
  try {
    console.log(`🔄 Intentando recuperar el expediente: ${expediente}`);
    
    const result = await recovery.recoverFailedExpediente(expediente);
    
    if (result.success) {
      console.log(`✅ Expediente ${expediente} recuperado con éxito:`);
      console.log(result.actions.map(a => `  - ${a}`).join('\n'));
    } else {
      console.log(`❌ No se pudo recuperar el expediente ${expediente}:`);
      console.log(result.errors.map(e => `  - ${e}`).join('\n'));
      console.log('\nAcciones intentadas:');
      console.log(result.actions.map(a => `  - ${a}`).join('\n'));
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error al procesar expediente ${expediente}:`, error);
    return {
      expediente,
      success: false,
      errors: [error.message],
      actions: []
    };
  }
}

/**
 * Verifica la integridad de un expediente específico
 */
async function verifyExpediente(expediente) {
  try {
    console.log(`🔍 Verificando expediente: ${expediente}`);
    
    // Verificar HTML
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    let hasHtml = false;
    
    try {
      await fs.access(htmlPath);
      hasHtml = true;
      console.log('✅ HTML encontrado');
    } catch (error) {
      console.log('❌ HTML no encontrado');
    }
    
    // Verificar JSON
    const jsonPath = path.join(process.cwd(), 'json', `${expediente}.json`);
    let hasJson = false;
    
    try {
      await fs.access(jsonPath);
      hasJson = true;
      console.log('✅ JSON encontrado');
      
      // Verificar integridad
      const integrity = await recovery.verifyJsonIntegrity(jsonPath);
      
      if (integrity.isValid) {
        console.log('✅ JSON válido');
        
        // Verificar archivos multimedia
        const mediaIntegrity = await recovery.verifyMediaIntegrity(integrity.data);
        console.log(`📊 Referencias a archivos multimedia: ${mediaIntegrity.mediaReferences}`);
        
        if (mediaIntegrity.missingFiles.length > 0) {
          console.log(`⚠️ Faltan ${mediaIntegrity.missingFiles.length} archivos multimedia:`);
          mediaIntegrity.missingFiles.forEach(url => console.log(`  - ${url}`));
        } else if (mediaIntegrity.mediaReferences > 0) {
          console.log('✅ Todos los archivos multimedia están disponibles');
        }
      } else {
        console.log('❌ JSON inválido o incompleto');
        if (integrity.missingFields) {
          console.log(`⚠️ Campos faltantes: ${integrity.missingFields.join(', ')}`);
        }
        if (integrity.error) {
          console.log(`⚠️ Error: ${integrity.error}`);
        }
      }
    } catch (error) {
      console.log('❌ JSON no encontrado');
    }
    
    // Verificar base de datos
    const connection = await mysql.createConnection(config);
    
    try {
      // Verificar tabla sim_precarga2_sic
      const [precargaRows] = await connection.execute(
        'SELECT idsic FROM sim_precarga2_sic WHERE idsic = ?',
        [expediente]
      );
      
      if (precargaRows.length > 0) {
        console.log('✅ Expediente presente en sim_precarga2_sic');
      } else {
        console.log('❌ Expediente no encontrado en sim_precarga2_sic');
      }
      
      // Verificar tabla scraping_gac_29k
      const [scrapingRows] = await connection.execute(
        'SELECT status FROM scraping_gac_29k WHERE idsic = ?',
        [expediente]
      );
      
      if (scrapingRows.length > 0) {
        console.log(`✅ Expediente en scraping_gac_29k con estado: ${scrapingRows[0].status || 'SIN ESTADO'}`);
      } else {
        console.log('❌ Expediente no encontrado en scraping_gac_29k');
      }
      
      // Verificar errores
      const [errorRows] = await connection.execute(
        'SELECT COUNT(*) as count FROM failed_responses WHERE expediente = ?',
        [expediente]
      );
      
      if (errorRows[0].count > 0) {
        console.log(`⚠️ Hay ${errorRows[0].count} errores registrados para este expediente`);
      } else {
        console.log('✅ No hay errores registrados para este expediente');
      }
    } finally {
      await connection.end();
    }
    
    return {
      hasHtml,
      hasJson
    };
  } catch (error) {
    console.error(`❌ Error al verificar expediente ${expediente}:`, error);
    return {
      hasHtml: false,
      hasJson: false,
      error: error.message
    };
  }
}

// Procesar argumentos de línea de comandos
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Si el primer argumento es un comando específico
    if (args[0] === 'verify' && args[1]) {
      // Verificar un expediente específico
      verifyExpediente(args[1]).catch(error => {
        console.error('❌ Error no controlado:', error);
        process.exit(1);
      });
    } else if (args[0] === 'recover' && args[1]) {
      // Recuperar un expediente específico
      recoverSingleExpediente(args[1]).catch(error => {
        console.error('❌ Error no controlado:', error);
        process.exit(1);
      });
    } else {
      // Interpretar el primer argumento como límite de recuperación
      const limit = parseInt(args[0]);
      if (!isNaN(limit)) {
        process.env.RECOVERY_LIMIT = args[0];
        main().catch(error => {
          console.error('❌ Error no controlado:', error);
          process.exit(1);
        });
      } else {
        console.log(`
        ======================================================
        🔍 RECUPERACIÓN DE EXPEDIENTES FALLIDOS
        ======================================================
        
        Uso:
          node src/recover-failed.js                   - Recuperar hasta 100 expedientes (predeterminado)
          node src/recover-failed.js 200               - Recuperar hasta 200 expedientes
          node src/recover-failed.js verify 12345678   - Verificar el expediente 12345678
          node src/recover-failed.js recover 12345678  - Recuperar el expediente 12345678
        
        ======================================================
        `);
      }
    }
  } else {
    main().catch(error => {
      console.error('❌ Error no controlado:', error);
      process.exit(1);
    });
  }
}

module.exports = {
  main,
  recoverSingleExpediente,
  verifyExpediente
};