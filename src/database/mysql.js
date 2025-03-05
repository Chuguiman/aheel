// src/database/mysql.js
const mysql = require('mysql2/promise');
const config = require('../config/mysql.config');

let connection = null;

/**
 * Establece una conexión con la base de datos MySQL
 * @returns {Promise<Object>} Conexión a la base de datos
 */
async function connect() {
  try {
    if (!connection) {
      connection = await mysql.createConnection(config);
      console.log('✅ Conexión a MySQL establecida');
    }
    return connection;
  } catch (err) {
    console.error("❌ Error al conectar a la base de datos MySQL:", err);
    throw err;
  }
}

/**
 * Cierra la conexión a la base de datos
 */
async function disconnect() {
  if (connection) {
    await connection.end();
    connection = null;
    console.log('👋 Conexión a MySQL cerrada');
  }
}

/**
 * Obtiene los expedientes desde la base de datos
 * @param {number} limit - Límite de expedientes a obtener
 * @param {number} offset - Desplazamiento para paginación
 * @returns {Promise<Array>} Lista de expedientes
 */
async function getExpedientes(limit = 1000, offset = 0) {
  const conn = await connect();
  try {
    const [rows] = await conn.execute(
      'SELECT idsic FROM scraping_gac_29k ORDER BY `idsic` DESC LIMIT ?, ?',
      [offset, limit]
    );
    return rows.map(row => row.idsic);
  } catch (err) {
    console.error("❌ Error al ejecutar la consulta:", err);
    throw err;
  }
}

/**
 * Inserta los datos de un expediente en la base de datos MySQL
 * @param {Object} expediente - Datos del expediente
 * @returns {Promise<string>} Resultado de la operación
 */
async function insertExpediente(expediente) {
  try {
    const conn = await connect();
    
    // Procesar datos para la tabla sim_precarga2_sic
    const prioridadInfo = expediente.prioridadInfo[0];
    let prioridad;
    
    if (prioridadInfo) {
      const pais = prioridadInfo.pais || '';
      const fechaDePrioridad = prioridadInfo.fechaDePrioridad || '';
      const numeroDePrioridad = prioridadInfo.numeroDePrioridad || '';
      prioridad = `${pais} | ${fechaDePrioridad} | ${numeroDePrioridad}`;
    } else {
      prioridad = null;
    }
    
    // Preparar los datos para la tabla sim_precarga2_sic
    const table1Data = {
      tiporeg: expediente.tipoSolicitud || null,
      denominacion: expediente.denominacionDelSigno || null,
      tipo_denomi: expediente.tipoDeSignoDistintivo || null,
      tipomarca: expediente.naturaleza || null,
      expediente: expediente.numeroSolicitud || null,
      fecha_solicitud: expediente.fechaRadicacion || null,
      solicitante: expediente.solicitantesInfo[0]?.solicitantes[0]?.fullName || null,
      dirsol: expediente.solicitantesInfo[0]?.solicitantes[0]?.direccion || null,
      domsol: expediente.solicitantesInfo[0]?.solicitantes[0]?.codPais || null,
      contacto: expediente.solicitantesInfo[0]?.contacto[0]?.nombre || null,
      dirconta: expediente.solicitantesInfo[0]?.contacto[0]?.direccion || null,
      domconta: expediente.solicitantesInfo[0]?.contacto[0]?.pais || null,
      clases: expediente.multiclases?.versionInfo?.clases || 0,
      gaceta: expediente.publicacionInfo.numeroGaceta || null,
      fecha_publicacion: expediente.publicacionInfo.fechaPublicacion || null,
      prioridad: prioridad,
      certi: expediente.certificadoInfo.certificado || null,
      vigencia: expediente.certificadoInfo.vigencia || null,
      estado: expediente.estado || null,
      idsic: expediente.idsic || null,
      regintal: expediente.registroInternacionalInfo.numeroRegistroInternacional || null,
      media: expediente.media?.[0] || null,
      reinvc: expediente.reivindicacionDeColores || null,
      vniza: expediente.multiclases.versionInfo.version || null,
    };
    
    // Convertir todos los valores 'undefined' a 'null'
    for (const key in table1Data) {
      table1Data[key] = table1Data[key] === undefined ? null : table1Data[key];
    }

    // Convertir el nombre del contacto a mayúsculas
    if (table1Data.contacto) {
      table1Data.contacto = table1Data.contacto.toUpperCase();
    }

    // Eliminar espacios al inicio y al final de las cadenas
    for (const key in table1Data) {
      if (typeof table1Data[key] === 'string') {
        table1Data[key] = table1Data[key].trim();
      }
    }

    const query1 = `INSERT INTO sim_precarga2_sic 
    (tiporeg, denominacion, tipo_denomi, tipomarca, expediente, fecha_solicitud, 
    solicitante, dirsol, domsol, contacto, dirconta, domconta, clases, gaceta, 
    fecha_publicacion, prioridad, certi, vigencia, estado, idsic, regintal, 
    media, reinvc, vniza) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await conn.query(query1, [
      table1Data.tiporeg, table1Data.denominacion, table1Data.tipo_denomi, 
      table1Data.tipomarca, table1Data.expediente, table1Data.fecha_solicitud, 
      table1Data.solicitante, table1Data.dirsol, table1Data.domsol, 
      table1Data.contacto, table1Data.dirconta, table1Data.domconta, 
      table1Data.clases, table1Data.gaceta, table1Data.fecha_publicacion, 
      table1Data.prioridad, table1Data.certi, table1Data.vigencia, 
      table1Data.estado, table1Data.idsic, table1Data.regintal, 
      table1Data.media, table1Data.reinvc, table1Data.vniza
    ]);

    // Prepare the data for the table precarga_pys_sim
    const table2Data = expediente.multiclases.clasesInfo.map(claseInfo => ({
      numsol: expediente.numeroSolicitud,
      idsic: expediente.idsic,
      nclas: claseInfo.clase,
      descpys: claseInfo.descripcion
    }));

    // Insert into the table precarga_pys_sim
    const query2 = 'INSERT INTO precarga_pys_sim (numsol, idsic, nclas, descpys) VALUES (?, ?, ?, ?);';
    for (const data of table2Data) {
      await conn.execute(query2, [data.numsol, data.idsic, data.nclas, data.descpys]);
    }

    console.log(`✅ Datos insertados con éxito para expediente: ${expediente.idsic}`);
    return 'success';
  } catch (error) {
    console.error(`❌ Error al insertar datos de expediente ${expediente.idsic}:`, error);
    return 'error';
  }
}

module.exports = {
  connect,
  disconnect,
  getExpedientes,
  insertExpediente
};

/*  */