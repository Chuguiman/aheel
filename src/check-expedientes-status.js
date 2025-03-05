// src/check-expedientes-status.js
/**
 * Script para verificar el estado de los expedientes y directorios
 * Útil para diagnosticar problemas en el procesamiento
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const mysqlConfig = require('./config/mysql.config');

/**
 * Realiza un chequeo completo del sistema
 */
async function performSystemCheck() {
  console.log(`
  ======================================================
  🔍 VERIFICACIÓN DE ESTADO DEL SISTEMA
  ======================================================
  Este script verificará el estado de los expedientes
  y la coherencia entre archivos y base de datos.
  ======================================================
  `);
  
  // Comprobar directorios
  await checkDirectories();
  
  // Comprobar archivos
  const fileStats = await checkFiles();
  
  // Comprobar base de datos
  const dbStats = await checkDatabase();
  
  // Comprobar coherencia
  await checkConsistency(fileStats, dbStats);
  
  console.log(`
  ======================================================
  ✅ VERIFICACIÓN COMPLETADA
  ======================================================
  `);
}

/**
 * Verifica la existencia y permisos de los directorios principales
 */
async function checkDirectories() {
  console.log('\n📂 VERIFICANDO DIRECTORIOS...');
  
  const directories = [
    { name: 'origen', path: path.join(process.cwd(), 'origen') },
    { name: 'json', path: path.join(process.cwd(), 'json') },
    { name: 'media', path: path.join(process.cwd(), 'media') }
  ];
  
  for (const dir of directories) {
    try {
      await fs.access(dir.path, fs.constants.R_OK | fs.constants.W_OK);
      console.log(`✅ Directorio ${dir.name} existe y tiene permisos de lectura/escritura`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`❌ Directorio ${dir.name} no existe`);
        
        // Intentar crear el directorio
        try {
          await fs.mkdir(dir.path, { recursive: true });
          console.log(`🛠️ Directorio ${dir.name} creado correctamente`);
        } catch (createError) {
          console.error(`❌ Error al crear directorio ${dir.name}:`, createError.message);
        }
      } else if (error.code === 'EACCES') {
        console.error(`❌ Directorio ${dir.name} existe pero no tiene permisos suficientes`);
      } else {
        console.error(`❌ Error al verificar directorio ${dir.name}:`, error.message);
      }
    }
  }
}

/**
 * Verifica los archivos HTML y JSON
 */
async function checkFiles() {
  console.log('\n📄 VERIFICANDO ARCHIVOS...');
  
  const fileStats = {
    htmlCount: 0,
    jsonCount: 0,
    htmlWithoutJson: [],
    jsonWithoutHtml: []
  };
  
  // Verificar archivos HTML
  try {
    const origenDir = path.join(process.cwd(), 'origen');
    const htmlFiles = (await fs.readdir(origenDir))
      .filter(file => file.endsWith('.html') && !file.includes('_redirected'))
      .map(file => path.basename(file, '.html'));
    
    fileStats.htmlCount = htmlFiles.length;
    console.log(`📊 Total de archivos HTML: ${fileStats.htmlCount}`);
    
    // Verificar archivos JSON
    const jsonDir = path.join(process.cwd(), 'json');
    let jsonFiles = [];
    
    try {
      jsonFiles = (await fs.readdir(jsonDir))
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
      
      fileStats.jsonCount = jsonFiles.length;
      console.log(`📊 Total de archivos JSON: ${fileStats.jsonCount}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Directorio JSON no existe');
        fileStats.jsonCount = 0;
      } else {
        throw error;
      }
    }
    
    // Crear conjuntos para búsqueda eficiente
    const htmlSet = new Set(htmlFiles);
    const jsonSet = new Set(jsonFiles);
    
    // Encontrar HTMLs sin JSON correspondiente
    for (const html of htmlFiles) {
      if (!jsonSet.has(html)) {
        fileStats.htmlWithoutJson.push(html);
      }
    }
    
    // Encontrar JSONs sin HTML correspondiente
    for (const json of jsonFiles) {
      if (!htmlSet.has(json)) {
        fileStats.jsonWithoutHtml.push(json);
      }
    }
    
    console.log(`📊 HTML sin JSON: ${fileStats.htmlWithoutJson.length}`);
    console.log(`📊 JSON sin HTML: ${fileStats.jsonWithoutHtml.length}`);
    
    // Mostrar algunos ejemplos para depuración
    if (fileStats.htmlWithoutJson.length > 0) {
      console.log(`🔍 Primeros 5 HTML sin JSON: ${fileStats.htmlWithoutJson.slice(0, 5).join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Error al verificar archivos:', error.message);
  }
  
  return fileStats;
}

/**
 * Verifica el estado de expedientes en la base de datos
 */
async function checkDatabase() {
  console.log('\n📊 VERIFICANDO BASE DE DATOS...');
  
  const dbStats = {
    pending: [],
    downloaded: [],
    processing: [],
    done: [],
    failed: [],
    total: 0
  };
  
  try {
    const connection = await mysql.createConnection(mysqlConfig);
    
    // Verificar si la tabla existe
    try {
      const [tables] = await connection.query(`
        SHOW TABLES LIKE 'scraping_gac_29k'
      `);
      
      if (tables.length === 0) {
        console.error('❌ La tabla scraping_gac_29k no existe en la base de datos');
        await connection.end();
        return dbStats;
      }
    } catch (error) {
      console.error('❌ Error al verificar la existencia de la tabla:', error.message);
      await connection.end();
      return dbStats;
    }
    
    // Obtener conteo por estado
    const [statusCounts] = await connection.query(`
      SELECT status, COUNT(*) as count 
      FROM scraping_gac_29k 
      WHERE active = 1
      GROUP BY status
    `);
    
    console.log('📊 Estado de expedientes en la base de datos:');
    statusCounts.forEach(row => {
      console.log(`   - ${row.status}: ${row.count}`);
      dbStats.total += row.count;
    });
    
    // Obtener ejemplos de cada estado
    const statuses = ['PENDING', 'DOWNLOADED', 'PROCESSING', 'DONE', 'FAILED'];
    for (const status of statuses) {
      const [rows] = await connection.query(`
        SELECT idsic FROM scraping_gac_29k 
        WHERE status = ? AND active = 1
        ORDER BY idsic DESC
        LIMIT 5
      `, [status]);
      
      dbStats[status.toLowerCase()] = rows.map(row => row.idsic);
      
      if (rows.length > 0) {
        console.log(`   Ejemplos de ${status}: ${rows.map(row => row.idsic).join(', ')}`);
      }
    }
    
    await connection.end();
  } catch (error) {
    console.error('❌ Error al verificar la base de datos:', error.message);
  }
  
  return dbStats;
}

/**
 * Verifica la coherencia entre archivos y base de datos
 */
async function checkConsistency(fileStats, dbStats) {
  console.log('\n🔄 VERIFICANDO COHERENCIA...');
  
  try {
    // Comprobar HTML con status DOWNLOADED en BD
    const connection = await mysql.createConnection(mysqlConfig);
    
    // 1. Verificar expedientes marcados como DOWNLOADED pero sin HTML
    for (const expediente of dbStats.downloaded) {
      const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
      try {
        await fs.access(htmlPath);
        // El archivo existe, está bien
      } catch (error) {
        console.log(`⚠️ El expediente ${expediente} está marcado como DOWNLOADED pero no tiene archivo HTML`);
      }
    }
    
    // 2. Verificar expedientes marcados como DONE pero sin JSON
    for (const expediente of dbStats.done) {
      const jsonPath = path.join(process.cwd(), 'json', `${expediente}.json`);
      try {
        await fs.access(jsonPath);
        // El archivo existe, está bien
      } catch (error) {
        console.log(`⚠️ El expediente ${expediente} está marcado como DONE pero no tiene archivo JSON`);
      }
    }
    
    // 3. Verificar HTMLs sin estado en la base de datos
    if (fileStats.htmlWithoutJson.length > 0) {
      // Tomar los primeros 5 para evitar consultas excesivas
      const sampleHtmls = fileStats.htmlWithoutJson.slice(0, 5);
      
      console.log(`\n🔍 Verificando estado en BD de ${sampleHtmls.length} archivos HTML sin JSON:`);
      
      for (const expediente of sampleHtmls) {
        const [rows] = await connection.query(`
          SELECT idsic, status FROM scraping_gac_29k 
          WHERE idsic = ?
        `, [expediente]);
        
        if (rows.length === 0) {
          console.log(`⚠️ El archivo HTML ${expediente} no tiene registro en la base de datos`);
        } else {
          console.log(`ℹ️ El archivo HTML ${expediente} tiene estado ${rows[0].status} en la base de datos`);
        }
      }
    }
    
    await connection.end();
    
    console.log('\n✅ Verificación de coherencia completada');
  } catch (error) {
    console.error('❌ Error al verificar coherencia:', error.message);
  }
}

/**
 * Busca archivos HTML sin procesar y actualiza su estado en la BD
 */
async function fixDownloadedStatus() {
  console.log('\n🛠️ ARREGLANDO ESTADOS DE EXPEDIENTES...');
  
  try {
    // Obtener archivos HTML
    const origenDir = path.join(process.cwd(), 'origen');
    const htmlFiles = (await fs.readdir(origenDir))
      .filter(file => file.endsWith('.html') && !file.includes('_redirected'))
      .map(file => path.basename(file, '.html'));
    
    // Obtener archivos JSON
    const jsonDir = path.join(process.cwd(), 'json');
    let jsonFiles = [];
    
    try {
      jsonFiles = (await fs.readdir(jsonDir))
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Directorio JSON no existe');
        jsonFiles = [];
      } else {
        throw error;
      }
    }
    
    // Crear Set para búsqueda eficiente
    const jsonSet = new Set(jsonFiles);
    
    // Filtrar HTMLs sin JSON
    const htmlsWithoutJson = htmlFiles.filter(html => !jsonSet.has(html));
    
    if (htmlsWithoutJson.length === 0) {
      console.log('✅ No se encontraron archivos HTML sin procesar');
      return;
    }
    
    console.log(`📊 Se encontraron ${htmlsWithoutJson.length} archivos HTML sin procesar`);
    console.log('🔍 Actualizando estados en la base de datos...');
    
    // Conectar a la base de datos
    const connection = await mysql.createConnection(mysqlConfig);
    
    // Estadísticas de actualización
    const stats = {
      updated: 0,
      notFound: 0
    };
    
    // Actualizar estado a DOWNLOADED para los primeros 100 expedientes (para evitar operaciones masivas)
    const batchSize = 100;
    const expedientesToUpdate = htmlsWithoutJson.slice(0, batchSize);
    
    console.log(`🔄 Actualizando estado de ${expedientesToUpdate.length} expedientes a DOWNLOADED...`);
    
    for (const expediente of expedientesToUpdate) {
      // Verificar si el expediente existe en la base de datos
      const [rows] = await connection.query(`
        SELECT idsic, status FROM scraping_gac_29k 
        WHERE idsic = ?
      `, [expediente]);
      
      if (rows.length === 0) {
        console.log(`⚠️ El expediente ${expediente} no existe en la base de datos`);
        stats.notFound++;
        continue;
      }
      
      // Solo actualizar si no está ya como DOWNLOADED o DONE
      if (rows[0].status !== 'DOWNLOADED' && rows[0].status !== 'DONE') {
        await connection.execute(`
          UPDATE scraping_gac_29k 
          SET status = 'DOWNLOADED' 
          WHERE idsic = ?
        `, [expediente]);
        
        stats.updated++;
        console.log(`✅ Expediente ${expediente} actualizado a DOWNLOADED`);
      } else {
        console.log(`ℹ️ Expediente ${expediente} ya está marcado como ${rows[0].status}`);
      }
    }
    
    await connection.end();
    
    console.log(`\n✅ Actualización completada: ${stats.updated} expedientes actualizados, ${stats.notFound} no encontrados`);
    console.log(`ℹ️ Quedan ${htmlsWithoutJson.length - batchSize} expedientes por actualizar`);
    
  } catch (error) {
    console.error('❌ Error al arreglar estados:', error.message);
  }
}

// Función principal
async function main() {
  try {
    // Verificar argumentos
    const args = process.argv.slice(2);
    
    if (args.includes('--fix') || args.includes('-f')) {
      await fixDownloadedStatus();
    } else {
      await performSystemCheck();
      
      console.log(`
      Si desea actualizar el estado de los expedientes HTML sin procesar,
      ejecute este script con el parámetro --fix:
      
      node src/check-expedientes-status.js --fix
      `);
    }
  } catch (error) {
    console.error('❌ Error general durante la ejecución:', error.message);
  }
}

// Ejecutar función principal
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  performSystemCheck,
  checkFiles,
  checkDatabase,
  fixDownloadedStatus
};