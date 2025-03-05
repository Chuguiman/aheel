// src/database/postgres.js
const { Pool } = require('pg');
const config = require('../config/postgres.config');

let pool = null;

/**
 * Inicializa el pool de conexiones a PostgreSQL
 * @returns {Pool} Pool de conexiones
 */
function getPool() {
  if (!pool) {
    pool = new Pool(config);
    console.log('✅ Pool de conexiones a PostgreSQL inicializado');
  }
  return pool;
}

/**
 * Cierra el pool de conexiones
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('👋 Pool de conexiones a PostgreSQL cerrado');
  }
}

/**
 * Inserta o actualiza un expediente en la base de datos PostgreSQL
 * @param {Object} expediente - Datos del expediente
 * @returns {Promise<boolean>} Resultado de la operación
 */
async function insertExpediente(expediente) {
  const { idsic, numeroSolicitud } = expediente;
  const pool = getPool();

  try {
    const client = await pool.connect();

    try {
      const query = `
        INSERT INTO expedientes (idsic, numero_solicitud, country_id, datos_completos)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (idsic) DO UPDATE SET 
            numero_solicitud = EXCLUDED.numero_solicitud,
            datos_completos = EXCLUDED.datos_completos;
      `;

      const values = [
        idsic,
        numeroSolicitud,
        47, // Country ID fijo
        JSON.stringify(expediente) // Guardamos el JSON completo
      ];

      await client.query(query, values);
      console.log(`✅ Expediente ${numeroSolicitud} insertado/actualizado en PostgreSQL.`);
      
      return true;
    } catch (error) {
      console.error("❌ Error insertando expediente:", error);
      return false;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("❌ Error conectando con PostgreSQL:", error);
    return false;
  }
}

/**
 * Procesa y guarda todos los expedientes en la base de datos
 * @param {Array} expedientes - Lista de objetos con datos de expedientes
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function processExpedientes(expedientes) {
  const results = {
    success: 0,
    failed: 0,
    failedIds: []
  };

  for (const expediente of expedientes) {
    const success = await insertExpediente(expediente);
    
    if (success) {
      results.success++;
    } else {
      results.failed++;
      results.failedIds.push(expediente.idsic);
    }
  }

  return results;
}

module.exports = {
  getPool,
  closePool,
  insertExpediente,
  processExpedientes
};