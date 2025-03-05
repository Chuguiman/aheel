// src/system-check.js
/**
 * Script de diagnóstico completo del sistema de scraping
 * para verificar la integridad y consistencia de todos los componentes
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config/mysql.config');

/**
 * Ejecuta verificaciones completas del sistema
 */
async function runSystemCheck() {
  const results = {
    summary: {
      status: 'OK',
      issues: 0,
      warnings: 0
    },
    expedientes: {
      total: 0,
      pendientes: 0,
      procesados: 0,
      fallidos: 0
    },
    archivos: {
      html: {
        total: 0,
        sinJson: 0,
        conJson: 0
      },
      json: {
        total: 0,
        sinHtml: 0,
        sinDB: 0
      },
      media: {
        total: 0,
        pdf: 0,
        image: 0,
        other: 0,
        unknown: 0
      }
    },
    database: {
      precarga: {
        total: 0,
        pys: 0
      },
      failing: {
        total: 0,
        recientes: 0
      }
    },
    issues: [],
    warnings: []
  };
  
  try {
    // 1. Verificar directorios
    await checkDirectories(results);
    
    // 2. Verificar archivos
    await checkFiles(results);
    
    // 3. Verificar base de datos
    await checkDatabase(results);
    
    // 4. Verificar consistencia entre archivos y DB
    await checkConsistency(results);
    
    // 5. Actualizar resumen
    if (results.issues.length > 0) {
      results.summary.status = 'ERROR';
      results.summary.issues = results.issues.length;
    } else if (results.warnings.length > 0) {
      results.summary.status = 'WARNING';
      results.summary.warnings = results.warnings.length;
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error durante la verificación del sistema:', error);
    results.summary.status = 'CRITICAL';
    results.issues.push({
      type: 'CRITICAL',
      message: `Error en la verificación del sistema: ${error.message}`,
      location: 'system-check.js'
    });
    return results;
  }
}

/**
 * Verifica la existencia de directorios necesarios
 */
async function checkDirectories(results) {
  const directories = ['origen', 'json', 'media'];
  
  for (const dir of directories) {
    try {
      await fs.access(path.join(process.cwd(), dir));
    } catch (error) {
      results.issues.push({
        type: 'ERROR',
        message: `El directorio "${dir}" no existe`,
        fix: `Crear el directorio: mkdir ${dir}`
      });
    }
  }
}

/**
 * Verifica los archivos en las carpetas
 */
async function checkFiles(results) {
  // Verificar HTML
  try {
    const origenDir = path.join(process.cwd(), 'origen');
    const htmlFiles = await fs.readdir(origenDir);
    const htmlList = htmlFiles.filter(file => file.endsWith('.html'));
    
    results.archivos.html.total = htmlList.length;
    
    // Verificar JSON
    const jsonDir = path.join(process.cwd(), 'json');
    const jsonFiles = await fs.readdir(jsonDir);
    const jsonList = jsonFiles.filter(file => file.endsWith('.json'));
    
    results.archivos.json.total = jsonList.length;
    
    // Crear conjuntos para comparación eficiente
    const htmlSet = new Set(htmlList.map(file => path.basename(file, '.html')));
    const jsonSet = new Set(jsonList.map(file => path.basename(file, '.json')));
    
    // Calcular diferencias
    for (const htmlFile of htmlSet) {
      if (jsonSet.has(htmlFile)) {
        results.archivos.html.conJson++;
      } else {
        results.archivos.html.sinJson++;
      }
    }
    
    for (const jsonFile of jsonSet) {
      if (!htmlSet.has(jsonFile)) {
        results.archivos.json.sinHtml++;
      }
    }
    
    // Verificar archivos multimedia
    const mediaDir = path.join(process.cwd(), 'media');
    const mediaFiles = await fs.readdir(mediaDir);
    
    results.archivos.media.total = mediaFiles.length;
    
    // Contar por extensión
    for (const file of mediaFiles) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.pdf') {
        results.archivos.media.pdf++;
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) {
        results.archivos.media.image++;
      } else if (ext) {
        results.archivos.media.other++;
      } else {
        results.archivos.media.unknown++;
      }
    }
    
    // Agregar advertencias
    if (results.archivos.html.sinJson > 0) {
      results.warnings.push({
        type: 'WARNING',
        message: `Hay ${results.archivos.html.sinJson} archivos HTML sin su correspondiente JSON`,
        fix: 'Ejecutar: node src/process-pending-html.js'
      });
    }
    
    if (results.archivos.media.unknown > 0) {
      results.warnings.push({
        type: 'WARNING',
        message: `Hay ${results.archivos.media.unknown} archivos multimedia sin extensión`,
        fix: 'Ejecutar: node src/media-converter.js'
      });
    }
    
    if (results.archivos.media.pdf > 0 && process.env.CONVERT_PDFS === 'true') {
      results.warnings.push({
        type: 'WARNING',
        message: `Hay ${results.archivos.media.pdf} archivos PDF que podrían convertirse a imágenes`,
        fix: 'Ejecutar: node src/media-converter.js'
      });
    }
    
  } catch (error) {
    results.issues.push({
      type: 'ERROR',
      message: `Error al verificar archivos: ${error.message}`,
      location: 'checkFiles'
    });
  }
}

/**
 * Verifica la base de datos
 */
async function checkDatabase(results) {
  const connection = await mysql.createConnection(config);
  
  try {
    // Verificar tabla sim_precarga2_sic
    const [precargaRows] = await connection.execute('SELECT COUNT(*) as count FROM sim_precarga2_sic');
    results.database.precarga.total = precargaRows[0].count;
    
    // Verificar tabla precarga_pys_sim
    const [pysRows] = await connection.execute('SELECT COUNT(*) as count FROM precarga_pys_sim');
    results.database.precarga.pys = pysRows[0].count;
    
    // Verificar tabla scraping_gac_29k
    const [scrapingRows] = await connection.execute(`
      SELECT
        status,
        COUNT(*) as count
      FROM scraping_gac_29k
      GROUP BY status
    `);
    
    // Procesar resultados
    scrapingRows.forEach(row => {
      results.expedientes.total += row.count;
      
      if (row.status === 'PENDING') {
        results.expedientes.pendientes = row.count;
      } else if (row.status === 'DONE') {
        results.expedientes.procesados = row.count;
      } else if (row.status === 'FAILED') {
        results.expedientes.fallidos = row.count;
      }
    });
    
    // Verificar errores recientes
    const [failingRows] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM failed_responses
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
    `);
    
    results.database.failing.recientes = failingRows[0].count;
    
    // Verificar total de errores
    const [totalFailingRows] = await connection.execute('SELECT COUNT(*) as count FROM failed_responses');
    results.database.failing.total = totalFailingRows[0].count;
    
    // Comprobar si hay problemas
    if (results.expedientes.fallidos > 0) {
      results.warnings.push({
        type: 'WARNING',
        message: `Hay ${results.expedientes.fallidos} expedientes marcados como fallidos`,
        fix: 'Revisar la tabla failed_responses y ejecutar: node src/main-batch-processor.js retry'
      });
    }
    
    if (results.database.failing.recientes > 0) {
      results.warnings.push({
        type: 'WARNING',
        message: `Se han registrado ${results.database.failing.recientes} errores en las últimas 24 horas`,
        fix: 'Revisar la tabla failed_responses para más detalles'
      });
    }
  } catch (error) {
    results.issues.push({
      type: 'ERROR',
      message: `Error al verificar base de datos: ${error.message}`,
      location: 'checkDatabase'
    });
  } finally {
    await connection.end();
  }
}

/**
 * Verifica la consistencia entre archivos y base de datos
 */
async function checkConsistency(results) {
  const connection = await mysql.createConnection(config);
  
  try {
    // Obtener expedientes en sim_precarga2_sic
    const [precargaRows] = await connection.execute('SELECT idsic FROM sim_precarga2_sic');
    const precargaSet = new Set(precargaRows.map(row => row.idsic));
    
    // Obtener expedientes con JSON
    const jsonDir = path.join(process.cwd(), 'json');
    const jsonFiles = await fs.readdir(jsonDir);
    const jsonSet = new Set(jsonFiles
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json')));
    
    // Verificar JSON sin registro en DB
    for (const jsonFile of jsonSet) {
      if (!precargaSet.has(jsonFile)) {
        results.archivos.json.sinDB++;
      }
    }
    
    // Verificar expedientes en DB sin JSON
    let dbSinJson = 0;
    for (const dbId of precargaSet) {
      if (!jsonSet.has(dbId)) {
        dbSinJson++;
      }
    }
    
    // Agregar alertas
    if (results.archivos.json.sinDB > 0) {
      results.issues.push({
        type: 'ERROR',
        message: `Hay ${results.archivos.json.sinDB} archivos JSON que no están registrados en la base de datos`,
        fix: 'Ejecutar: node src/process-pending-html.js'
      });
    }
    
    if (dbSinJson > 0) {
      results.issues.push({
        type: 'ERROR',
        message: `Hay ${dbSinJson} expedientes en la base de datos sin su correspondiente archivo JSON`,
        fix: 'Investigar inconsistencia entre la base de datos y los archivos'
      });
    }
    
  } catch (error) {
    results.issues.push({
      type: 'ERROR',
      message: `Error al verificar consistencia: ${error.message}`,
      location: 'checkConsistency'
    });
  } finally {
    await connection.end();
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log(`
    ======================================================
    🔍 VERIFICACIÓN COMPLETA DEL SISTEMA
    ======================================================
    Este script realizará un diagnóstico completo del sistema
    de scraping, verificando archivos, base de datos y
    consistencia entre todos los componentes.
    ======================================================
    `);
    
    const results = await runSystemCheck();
    
    // Mostrar resultados
    console.log(`
    ======================================================
    📊 RESULTADOS DE LA VERIFICACIÓN
    ======================================================
    
    Estado general: ${getStatusEmoji(results.summary.status)} ${results.summary.status}
    ${results.summary.issues > 0 ? `⚠️ Problemas encontrados: ${results.summary.issues}` : ''}
    ${results.summary.warnings > 0 ? `⚠️ Advertencias: ${results.summary.warnings}` : ''}
    
    EXPEDIENTES:
    - Total en sistema: ${results.expedientes.total}
    - Pendientes: ${results.expedientes.pendientes}
    - Procesados: ${results.expedientes.procesados}
    - Fallidos: ${results.expedientes.fallidos}
    
    ARCHIVOS:
    - HTML: ${results.archivos.html.total} (${results.archivos.html.sinJson} sin JSON)
    - JSON: ${results.archivos.json.total} (${results.archivos.json.sinDB} sin registro en DB)
    - Media: ${results.archivos.media.total} (${results.archivos.media.pdf} PDF, ${results.archivos.media.image} imágenes)
    
    BASE DE DATOS:
    - Registros en sim_precarga2_sic: ${results.database.precarga.total}
    - Registros en precarga_pys_sim: ${results.database.precarga.pys}
    - Errores registrados: ${results.database.failing.total} (${results.database.failing.recientes} en las últimas 24h)
    `);
    
    // Mostrar problemas y advertencias
    if (results.issues.length > 0) {
      console.log('\n⚠️ PROBLEMAS ENCONTRADOS:');
      results.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.message}`);
        if (issue.fix) {
          console.log(`   Solución sugerida: ${issue.fix}`);
        }
      });
    }
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️ ADVERTENCIAS:');
      results.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.message}`);
        if (warning.fix) {
          console.log(`   Solución sugerida: ${warning.fix}`);
        }
      });
    }
    
    console.log(`
    ======================================================
    
    🔍 PRÓXIMOS PASOS RECOMENDADOS:
    
    ${getNextSteps(results)}
    
    ======================================================
    `);
    
  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
    process.exit(1);
  }
}

/**
 * Devuelve un emoji según el estado
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'OK':
      return '✅';
    case 'WARNING':
      return '⚠️';
    case 'ERROR':
      return '❌';
    case 'CRITICAL':
      return '🔥';
    default:
      return '❓';
  }
}

/**
 * Determina los próximos pasos recomendados según los resultados
 */
function getNextSteps(results) {
  const steps = [];
  
  // Verificar problemas principales
  if (results.archivos.html.sinJson > 0) {
    steps.push('1. Procesar los HTML pendientes: node src/process-pending-html.js');
  }
  
  if (results.archivos.media.pdf > 0 || results.archivos.media.unknown > 0) {
    steps.push(`${steps.length + 1}. Procesar archivos multimedia: node src/media-converter.js`);
  }
  
  if (results.expedientes.fallidos > 0) {
    steps.push(`${steps.length + 1}. Reintentar expedientes fallidos: node src/main-batch-processor.js retry`);
  }
  
  if (results.expedientes.pendientes > 0) {
    steps.push(`${steps.length + 1}. Continuar con el scraping pendiente: node src/main-batch-processor.js`);
  }
  
  if (steps.length === 0) {
    if (results.issues.length > 0) {
      steps.push('Solucionar los problemas indicados arriba antes de continuar');
    } else {
      steps.push('¡El sistema está en buen estado! Puede continuar con el scraping de nuevos expedientes.');
    }
  }
  
  return steps.join('\n\n');
}

// Ejecutar la función principal
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error no controlado:', error);
    process.exit(1);
  });
}

module.exports = {
  runSystemCheck,
  checkDirectories,
  checkFiles,
  checkDatabase,
  checkConsistency
};