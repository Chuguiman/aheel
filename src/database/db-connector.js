const mysql = require('mysql2/promise');
const config = require('../config/mysql.config');


    /**
     * Inserta los datos en las tablas de la base de datos
     * @param {Object} data - Datos extraídos del expediente
     * @param {Object} config - Configuración de la base de datos
     * @returns {Promise<Object>} - Resultado de la operación
     */
    async function insertToSimPrecarga(data, config) {
        const connection = await mysql.createConnection(config);
        
        try {
        // Iniciar transacción
        await connection.beginTransaction();
    
        // Verificar si debemos usar apoderado como contacto
        const hayContacto = data.solicitantesInfo[0]?.contacto && data.solicitantesInfo[0]?.contacto.length > 0;
        const hayApoderado = data.solicitantesInfo[0]?.apoderados && data.solicitantesInfo[0]?.apoderados.length > 0;
        const usarApoderadoComoContacto = !hayContacto && hayApoderado;
        
        // Información del contacto (ya sea real o del apoderado si no hay contacto)
        let nombreContacto, direccionContacto, paisContacto;
        
        if (hayContacto) {
            nombreContacto = data.solicitantesInfo[0].contacto[0].nombre || null;
            direccionContacto = data.solicitantesInfo[0].contacto[0].direccion || null;
            paisContacto = data.solicitantesInfo[0].contacto[0].pais || 'CO';
        } else if (hayApoderado) {
            nombreContacto = data.solicitantesInfo[0].apoderados[0].fullName || null;
            direccionContacto = data.solicitantesInfo[0].apoderados[0].direccion || null;
            paisContacto = data.solicitantesInfo[0].apoderados[0].codPais || 'CO';
        } else {
            nombreContacto = null;
            direccionContacto = null;
            paisContacto = 'CO';
        }
        
        // Formatear prioridades
        let prioridadFormateada = '';
        if (data.prioridadInfo && data.prioridadInfo.length > 0) {
            prioridadFormateada = data.prioridadInfo.map(p => 
            `${p.pais} | ${p.fechaDePrioridad} | ${p.numeroDePrioridad}`
            ).join(' # ');
            
            // Asegurarnos de que no exceda el tamaño máximo
            if (prioridadFormateada.length > 250) {
            prioridadFormateada = prioridadFormateada.substring(0, 250);
            }
        }
        
        // Determinar tipo de signo distintivo
        const tipoSigno = (data.tipoDeSignoDistintivo || '').toLowerCase();
        const esEnseñaONombreComercial = tipoSigno.includes('enseña') || tipoSigno.includes('nombre comercial');
        const escapedDenominacion = escapeForSQL(data.denominacionDelSigno);
        
        // Preparar datos para inserción según el formato de la tabla
        const insertData = {
            tiporeg: data.tipoSolicitud || null,
            denominacion: escapedDenominacion || null,
            tipo_denomi: data.tipoDeSignoDistintivo || null,
            tipomarca: data.naturaleza || null,
            expediente: data.numeroSolicitud || null,
            fecha_solicitud: data.fechaRadicacion || null,
            solicitante: data.solicitantesInfo[0]?.solicitantes[0]?.fullName || null,
            dirsol: data.solicitantesInfo[0]?.solicitantes[0]?.direccion || null,
            domsol: data.solicitantesInfo[0]?.solicitantes[0]?.codPais || 'CO',
            contacto: nombreContacto,
            dirconta: direccionContacto,
            domconta: paisContacto,
            clases: esEnseñaONombreComercial ? '0' : (data.multiclases?.versionInfo?.clases || '0'),
            gaceta: data.publicacionInfo?.numeroGaceta || null,
            fecha_publicacion: data.publicacionInfo?.fechaPublicacion || null,
            prioridad: prioridadFormateada || null,
            certi: data.certificadoInfo?.certificado || null,
            vigencia: data.certificadoInfo?.vigencia || data.certificadoInfo?.fechaRenovacion || null,
            estado: data.estado || null,
            idsic: data.idsic || null,
            regintal: data.registroInternacionalInfo?.numeroRegistroInternacional || null,
            media: data.media?.[0] || null,
            reinvc: data.reivindicacionDeColores || null,
            vniza: esEnseñaONombreComercial ? '0' : (data.multiclases?.versionInfo?.version || '0'),
            codigos_viena: null
        };
        
        // Convertir valores undefined a null
        Object.keys(insertData).forEach(key => {
            if (insertData[key] === undefined) {
            insertData[key] = null;
            }
        });
        
        // Registrar información antes de insertar
        console.log(`ℹ️ Datos a insertar para expediente ${data.idsic}:`);
        console.log(`- Tipo: ${insertData.tipo_denomi}`);
        console.log(`- Clases: ${insertData.clases}`);
        console.log(`- Versión Niza: ${insertData.vniza}`);
        
        // Ejecutar SQL para insertar en sim_precarga2_sic
        const sqlPrecarga = `
            INSERT INTO sim_precarga2_sic (
            tiporeg, denominacion, tipo_denomi, tipomarca, expediente, 
            fecha_solicitud, solicitante, dirsol, domsol, contacto, 
            dirconta, domconta, clases, gaceta, fecha_publicacion, 
            prioridad, certi, vigencia, estado, idsic, 
            regintal, media, reinvc, vniza, codigos_viena
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            tiporeg = VALUES(tiporeg),
            denominacion = VALUES(denominacion),
            tipo_denomi = VALUES(tipo_denomi),
            tipomarca = VALUES(tipomarca),
            fecha_solicitud = VALUES(fecha_solicitud),
            solicitante = VALUES(solicitante),
            dirsol = VALUES(dirsol),
            domsol = VALUES(domsol),
            contacto = VALUES(contacto),
            dirconta = VALUES(dirconta),
            domconta = VALUES(domconta),
            clases = VALUES(clases),
            gaceta = VALUES(gaceta),
            fecha_publicacion = VALUES(fecha_publicacion),
            prioridad = VALUES(prioridad),
            certi = VALUES(certi),
            vigencia = VALUES(vigencia),
            estado = VALUES(estado),
            regintal = VALUES(regintal),
            media = VALUES(media),
            reinvc = VALUES(reinvc),
            vniza = VALUES(vniza),
            codigos_viena = VALUES(codigos_viena)
        `;
        
        await connection.execute(sqlPrecarga, [
            insertData.tiporeg, insertData.denominacion, insertData.tipo_denomi, insertData.tipomarca, insertData.expediente,
            insertData.fecha_solicitud, insertData.solicitante, insertData.dirsol, insertData.domsol, insertData.contacto,
            insertData.dirconta, insertData.domconta, insertData.clases, insertData.gaceta, insertData.fecha_publicacion,
            insertData.prioridad, insertData.certi, insertData.vigencia, insertData.estado, insertData.idsic,
            insertData.regintal, insertData.media, insertData.reinvc, insertData.vniza, insertData.codigos_viena
        ]);
        
        // 2. Insertar productos y servicios solo si hay clases definidas y no es enseña o nombre comercial
        if (!esEnseñaONombreComercial && data.multiclases?.clasesInfo?.length > 0) {
            for (const claseInfo of data.multiclases.clasesInfo) {
            const sqlProductos = `
                INSERT INTO precarga_pys_sim (numsol, idsic, nclas, descpys)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE descpys = VALUES(descpys)
            `;
            
            await connection.execute(sqlProductos, [
                data.numeroSolicitud, data.idsic, claseInfo.clase, claseInfo.descripcion
            ]);
            }
        }
        
        // Confirmar transacción
        await connection.commit();
        console.log(`✅ Datos insertados con éxito para expediente ${data.idsic}`);
        
        return { success: true };
        } catch (error) {
        // Revertir transacción en caso de error
        await connection.rollback();
        console.error(`❌ Error al insertar datos en la base de datos para expediente ${data.idsic}:`, error);
        console.error(`Detalles: ${error.sqlMessage || error.message}`);
        
        return { success: false, error: error.message };
        } finally {
        await connection.end();
        }
    }
    
  

    /**
     * Crea la tabla de estadísticas si no existe
     */
    async function createStatsTableIfNotExists() {
        const connection = await mysql.createConnection(config);
        
        try {
          await connection.execute(`
            CREATE TABLE IF NOT EXISTS processing_stats (
              id INT AUTO_INCREMENT PRIMARY KEY,
              batch_id INT NOT NULL,
              start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              end_time TIMESTAMP NULL,
              total_expedientes INT DEFAULT 0,
              successful_expedientes INT DEFAULT 0,
              failed_expedientes INT DEFAULT 0,
              notes TEXT
            )
          `);
          console.log('✅ Tabla de estadísticas verificada/creada');
        } catch (error) {
          console.error('❌ Error al crear tabla de estadísticas:', error);
        } finally {
          await connection.end();
        }
      }



    /**
     * Registra estadísticas de procesamiento en la base de datos
     */
    async function insertBatchStats(total, successful, failed, batchId) {
        const connection = await mysql.createConnection(config);
        
        try {
        await connection.execute(
            `INSERT INTO processing_stats 
            (batch_id, total_expedientes, successful_expedientes, failed_expedientes, notes)
            VALUES (?, ?, ?, ?, ?)`,
            [batchId, total, successful, failed, `Lote #${batchId} procesado`]
        );
        
        // Actualizar end_time
        await connection.execute(
            `UPDATE processing_stats SET end_time = NOW() WHERE batch_id = ? AND end_time IS NULL`,
            [batchId]
        );
        
        console.log(`📊 Estadísticas del lote #${batchId} guardadas en la base de datos`);
        } catch (error) {
        console.error(`❌ Error al guardar estadísticas del lote #${batchId}:`, error);
        } finally {
        await connection.end();
        }
    }

    /* /**
    * Recupera expedientes fallidos para reintentar
    */
    async function getFailedExpedientes(limit = 100) {
        const connection = await mysql.createConnection(config);
        
        try {
        console.log(`🔍 Buscando expedientes con status='FAILED' y active=1, límite=${limit}`);
        
        // Consulta directa sin usar parámetros en LIMIT
        const [rows] = await connection.execute(`
            SELECT idsic FROM scraping_sic 
            WHERE status = 'FAILED' AND active = 1
            ORDER BY idsic DESC
            LIMIT ${parseInt(limit)}
        `);
        
        console.log(`📋 Encontrados ${rows.length} expedientes fallidos`);
        
        return rows.map(row => row.idsic);
        } catch (error) {
        console.error('❌ Error al obtener expedientes fallidos:', error);
        throw error;
        } finally {
        await connection.end();
        }
    }

    /**
     * Recupera expedientes descargados pero no procesados
     */
    async function getDownloadedExpedientes(limit = 100) {
        const connection = await mysql.createConnection(config);
        
        try {
        console.log(`🔍 Buscando expedientes con status='DOWNLOADED' y active=1, límite=${limit}`);
        
        // Consulta directa sin usar parámetros en LIMIT
        const [rows] = await connection.execute(`
            SELECT idsic FROM scraping_sic 
            WHERE status = 'DOWNLOADED' AND active = 1
            ORDER BY idsic DESC
            LIMIT ${parseInt(limit)}
        `);
        
        console.log(`📋 Encontrados ${rows.length} expedientes descargados y no procesados`);
        
        // Verificar que los archivos HTML existen para estos expedientes
        const expedientesConHTML = [];
        for (const row of rows) {
            const htmlPath = path.join(process.cwd(), 'origen', `${row.idsic}.html`);
            try {
            await fs.access(htmlPath);
            expedientesConHTML.push(row.idsic);
            } catch (error) {
            console.warn(`⚠️ Expediente ${row.idsic} marcado como DOWNLOADED pero no se encuentra el HTML`);
            }
        }
        
        console.log(`📊 De los ${rows.length} expedientes, ${expedientesConHTML.length} tienen archivo HTML disponible`);
        
        return expedientesConHTML;
        } catch (error) {
        console.error('❌ Error al obtener expedientes descargados:', error);
        throw error;
        } finally {
        await connection.end();
        }
    }

    function escapeForSQL(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/'/g, "''");
    }

// Exportar todas las funciones
module.exports = {
  insertToSimPrecarga,
  escapeForSQL,
  createStatsTableIfNotExists,
  insertBatchStats,
  getFailedExpedientes,
  getDownloadedExpedientes
};

   