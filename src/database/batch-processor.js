// src/database/batch-processor.js
/**
 * Este módulo maneja el procesamiento por lotes y el seguimiento del estado
 * para el scraping del sistema SIPI de la SIC
 */
const mysql = require('mysql2/promise');
const config = require('../config/mysql.config');
const path = require('path');
const fs = require('fs').promises;

/**
 * Obtiene los expedientes pendientes de la base de datos
 * @param {number} limit - Número máximo de expedientes a obtener
 * @returns {Promise<Array>} - Array de expedientes pendientes
 */
async function getPendingExpedientes(limit = 10) {
  const connection = await mysql.createConnection(config);
  
  try {
    const [rows] = await connection.execute(`
      SELECT idsic FROM scraping_gac_29k 
      WHERE status = 'PENDING' AND active = 1
      ORDER BY idsic DESC
      LIMIT ${limit}`
   );
    
    return rows.map(row => row.idsic);
  } catch (error) {
    console.error('❌ Error al obtener expedientes pendientes:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Marca un expediente como completado
 * @param {string} expediente - ID del expediente
 */
async function markDone(expediente) {
  const connection = await mysql.createConnection(config);
  
  try {
    await connection.execute(
      'UPDATE scraping_gac_29k SET status = "DONE" WHERE idsic = ?',
      [expediente]
    );
    console.log(`✅ Expediente ${expediente} marcado como DONE`);
  } catch (error) {
    console.error(`❌ Error al marcar expediente ${expediente} como completado:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Marca un expediente como fallido
 * @param {string} expediente - ID del expediente
 */
async function markFailed(expediente) {
  const connection = await mysql.createConnection(config);
  
  try {
    await connection.execute(
      'UPDATE scraping_gac_29k SET status = "FAILED" WHERE idsic = ?',
      [expediente]
    );
    console.log(`⚠️ Expediente ${expediente} marcado como FAILED`);
  } catch (error) {
    console.error(`❌ Error al marcar expediente ${expediente} como fallido:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Guarda el archivo JSON en disco y registra su existencia en la base de datos
 * @param {string} expediente - ID del expediente
 * @param {Object} data - Datos JSON a guardar
 * @returns {Promise<string>} - Ruta del archivo JSON guardado
 */
async function storeJsonFile(expediente, data) {
  try {
    // Asegurar que el directorio de JSON exista
    const jsonDir = path.join(process.cwd(), 'json');
    await fs.mkdir(jsonDir, { recursive: true });
    
    // Guardar el archivo JSON
    const jsonPath = path.join(jsonDir, `${expediente}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    
    console.log(`💾 Archivo JSON guardado para expediente ${expediente}`);
    return jsonPath;
  } catch (error) {
    console.error(`❌ Error al guardar archivo JSON para expediente ${expediente}:`, error);
    throw error;
  }
}

/**
 * Verifica si ya existe un HTML descargado para el expediente
 * @param {string} expediente - ID del expediente
 * @returns {Promise<boolean>} - true si existe, false si no
 */
async function htmlExists(expediente) {
  try {
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    await fs.access(htmlPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica si ya existe un JSON generado para el expediente
 * @param {string} expediente - ID del expediente
 * @returns {Promise<boolean>} - true si existe, false si no
 */
async function jsonExists(expediente) {
  try {
    const jsonPath = path.join(process.cwd(), 'json', `${expediente}.json`);
    await fs.access(jsonPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Elimina el archivo HTML si existe el JSON correspondiente
 * @param {string} expediente - ID del expediente
 * @returns {Promise<boolean>} - true si se eliminó, false si no
 */
async function cleanupHtmlIfJsonExists(expediente) {
  try {
    // Verificar si existe el JSON
    const hasJson = await jsonExists(expediente);
    if (!hasJson) {
      return false;
    }
    
    // Eliminar el HTML
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    await fs.unlink(htmlPath);
    console.log(`🗑️ HTML eliminado para expediente ${expediente}`);
    return true;
  } catch (error) {
    console.error(`⚠️ Error al eliminar HTML para expediente ${expediente}:`, error);
    return false;
  }
}

/**
 * Registra un error en la base de datos
 * @param {string} expediente - ID del expediente
 * @param {string} errorMsg - Mensaje de error
 * @param {number} attempt - Número de intento
 */
async function storeFailureInDb(expediente, errorMsg, attempt) {
  const connection = await mysql.createConnection(config);
  
  try {
    await connection.execute(
      'INSERT INTO failed_responses (expediente, error_msg, attempt) VALUES (?, ?, ?)',
      [expediente, errorMsg, attempt]
    );
    console.log(`⚠️ Error registrado para expediente ${expediente}`);
  } catch (error) {
    console.error(`❌ Error al registrar fallo para expediente ${expediente}:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Inserta los datos extraídos en la tabla sim_precarga2_sic
 * @param {Object} data - Datos extraídos del expediente
 * @returns {Promise<boolean>} - true si se insertó correctamente
 */
/**
 * Convierte una fecha a formato MySQL (YYYY-MM-DD)
 * @param {string} fechaStr - Fecha en cualquier formato
 * @returns {string|null} - Fecha en formato MySQL o null si no se pudo convertir
 */
function convertToMySQLDateFormat(fechaStr) {
  if (!fechaStr) return null;
  
  try {
    // Limpiar la fecha
    const fechaLimpia = fechaStr.replace(/\s+/g, ' ').trim();
    
    // Si ya está en formato MySQL, devolverla
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaLimpia)) {
      return fechaLimpia;
    }
    
    // Meses en español e inglés para conversión
    const meses = {
      'ene': '01', 'jan': '01', 'enero': '01', 'january': '01',
      'feb': '02', 'febrero': '02', 'february': '02',
      'mar': '03', 'marzo': '03', 'march': '03',
      'abr': '04', 'apr': '04', 'abril': '04', 'april': '04',
      'may': '05', 'mayo': '05',
      'jun': '06', 'junio': '06', 'june': '06',
      'jul': '07', 'julio': '07', 'july': '07',
      'ago': '08', 'aug': '08', 'agosto': '08', 'august': '08',
      'sep': '09', 'sept': '09', 'septiembre': '09', 'september': '09',
      'oct': '10', 'octubre': '10', 'october': '10',
      'nov': '11', 'noviembre': '11', 'november': '11',
      'dic': '12', 'dec': '12', 'diciembre': '12', 'december': '12'
    };
    
    // Formato: DD/MM/YYYY o DD-MM-YYYY
    const matchSlash = fechaLimpia.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (matchSlash) {
      const dia = matchSlash[1].padStart(2, '0');
      const mes = matchSlash[2].padStart(2, '0');
      const anio = matchSlash[3];
      
      return `${anio}-${mes}-${dia}`;
    }
    
    // Formato: YYYY/MM/DD o YYYY-MM-DD (pero con / o -)
    const matchYearFirst = fechaLimpia.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (matchYearFirst) {
      const anio = matchYearFirst[1];
      const mes = matchYearFirst[2].padStart(2, '0');
      const dia = matchYearFirst[3].padStart(2, '0');
      
      return `${anio}-${mes}-${dia}`;
    }
    
    // Formato: DD mes YYYY (ej: 11 oct. 2016)
    const matchTextMonth = fechaLimpia.match(/^(\d{1,2})\s+([a-zá-úñ]{3,10})\.?\s+(\d{4})$/i);
    if (matchTextMonth) {
      const dia = matchTextMonth[1].padStart(2, '0');
      const mesStr = matchTextMonth[2].toLowerCase().replace(/\.$/, '').substring(0, 3);
      const mes = meses[mesStr] || '01'; // Default a enero si no se reconoce
      const anio = matchTextMonth[3];
      
      return `${anio}-${mes}-${dia}`;
    }
    
    // Formato: mes DD, YYYY (ej: October 21, 2016)
    const matchMonthFirst = fechaLimpia.match(/^([a-zá-úñ]{3,10})\s+(\d{1,2})(?:,|\.|\s)\s*(\d{4})$/i);
    if (matchMonthFirst) {
      const mesStr = matchMonthFirst[1].toLowerCase().substring(0, 3);
      const mes = meses[mesStr] || '01';
      const dia = matchMonthFirst[2].padStart(2, '0');
      const anio = matchMonthFirst[3];
      
      return `${anio}-${mes}-${dia}`;
    }
    
    // Si todo falla, intentar una aproximación más agresiva
    const numeros = fechaLimpia.match(/\d+/g);
    if (numeros && numeros.length >= 3) {
      // Asumimos que si hay un número de 4 dígitos, es el año
      const anioIndex = numeros.findIndex(n => n.length === 4);
      if (anioIndex !== -1) {
        const anio = numeros[anioIndex];
        let dia, mes;
        
        // Determinar cuál es el día y cuál es el mes
        if (anioIndex === 0) {
          // Formato YYYY-MM-DD
          mes = numeros[1].padStart(2, '0');
          dia = numeros[2].padStart(2, '0');
        } else {
          // Formato DD-MM-YYYY o MM-DD-YYYY
          // En ausencia de información específica, asumimos DD-MM-YYYY por ser más común internacionalmente
          dia = numeros[0].padStart(2, '0');
          mes = numeros[1].padStart(2, '0');
          
          // Verificar si el mes es válido (1-12), si no, intercambiar
          if (parseInt(mes) > 12) {
            const temp = mes;
            mes = dia;
            dia = temp;
          }
        }
        
        return `${anio}-${mes}-${dia}`;
      }
    }
    
    // Si todo falla, devolver null
    console.warn(`⚠️ No se pudo convertir la fecha: ${fechaLimpia}`);
    return null;
  } catch (error) {
    console.warn('⚠️ Error al convertir fecha:', error.message);
    return null; // Devolver null en caso de error
  }
}

  /**
 * [DEPRECATED] Inserta los datos extraídos en la tabla sim_precarga2_sic
 * Se recomienda usar la función insertToSimPrecarga del módulo extractor-sic.js
 * @param {Object} data - Datos extraídos del expediente
 * @returns {Promise<boolean>} - true si se insertó correctamente
 */
async function insertToSimPrecarga(data) {
  console.warn('⚠️ Usando la versión deprecada de insertToSimPrecarga. Se recomienda usar la del módulo extractor-sic.js');
  
  try {
    // Importar el nuevo módulo y usar su función
    const { insertToSimPrecarga: newInsertToSimPrecarga } = require('../services/extractor-sic');
    const config = require('../config/mysql.config');
    
    // Llamar a la nueva implementación
    const result = await newInsertToSimPrecarga(data, config);
    
    return result.success;
  } catch (error) {
    console.error(`❌ Error al insertar en sim_precarga2_sic para expediente ${data.idsic || 'desconocido'}:`, error);
    return false;
  }
}

module.exports = {
  getPendingExpedientes,
  markDone,
  markFailed,
  storeJsonFile,
  storeFailureInDb,
  htmlExists,
  jsonExists,
  cleanupHtmlIfJsonExists,
  insertToSimPrecarga 
};