// src/services/single-processor.js
/**
 * Este módulo contiene funciones especializadas para el procesamiento individual
 * de archivos HTML, su conversión a JSON y la inserción en MySQL
 */
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const cheerio = require('cheerio');
const { extractDataWithErrorHandling } = require('./extractor-sic');

/**
 * Procesa un único archivo HTML y lo convierte a JSON
 * @param {string} htmlPath - Ruta completa al archivo HTML
 * @returns {Promise<Object>} - Datos extraídos en formato JSON
 */
async function processHtmlSingle(htmlPath) {
  try {
    console.log(`🔍 Procesando HTML individual: ${htmlPath}`);
    
    // Verificar que el archivo existe
    try {
      await fs.access(htmlPath);
      console.log(`✅ Archivo HTML encontrado: ${htmlPath}`);
    } catch (error) {
      console.error(`❌ Archivo HTML no encontrado: ${htmlPath}`);
      throw new Error(`Archivo HTML no encontrado: ${htmlPath}`);
    }
    
    // Extraer expediente del nombre de archivo
    const nombreArchivo = path.basename(htmlPath, '.html');
    console.log(`🔑 Expediente extraído del nombre de archivo: ${nombreArchivo}`);
    
    // Leer el HTML original
    let rawHtml = await fs.readFile(htmlPath, 'utf8');
    console.log(`📄 HTML leído, tamaño: ${(rawHtml.length / 1024).toFixed(2)} KB`);
    
    // Verificar si contiene una redirección
    const redirectUrl = extractRedirectUrl(rawHtml);
    
    // Si hay redirección, mostrarla
    if (redirectUrl) {
      console.log(`🔄 Detectada redirección para expediente ${nombreArchivo}: ${redirectUrl}`);
    }
    
    // Extraer datos del HTML usando la función existente
    console.log(`🧮 Extrayendo datos para expediente ${nombreArchivo}...`);
    const data = await extractDataWithErrorHandling(nombreArchivo);
    
    // Validar y asegurar que el campo idsic exista
    if (!data.idsic || data.idsic === 'undefined') {
      console.log(`⚠️ ID SIC no encontrado en los datos, usando nombre de archivo: ${nombreArchivo}`);
      data.idsic = nombreArchivo;
    }
    
    // Asegurar que otros campos críticos existan
    if (!data.numeroSolicitud && data.idsic) {
      data.numeroSolicitud = data.idsic;
    }
    
    // Validar y limpiar los datos
    cleanAndValidateData(data);
    
    console.log(`✅ Datos extraídos exitosamente para ${nombreArchivo}`);
    return data;
  } catch (error) {
    console.error(`❌ Error al procesar HTML individual:`, error);
    throw error;
  }
}

/**
 * Extrae la URL de redirección de un HTML si existe
 * @param {string} html - Contenido HTML a analizar
 * @returns {string|null} - URL de redirección o null si no hay
 */
function extractRedirectUrl(html) {
  try {
    // Método 1: Buscar div#first-redirect-url
    const redirectDivMatch = html.match(/<div\s+id="first-redirect-url"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>/i);
    if (redirectDivMatch && redirectDivMatch[1]) {
      return redirectDivMatch[1];
    }
    
    // Método 2: Buscar meta refresh
    const metaRefreshMatch = html.match(/<meta\s+http-equiv="refresh"[^>]*content="[^"]*URL=([^"]+)"[^>]*>/i);
    if (metaRefreshMatch && metaRefreshMatch[1]) {
      return metaRefreshMatch[1];
    }
    
    // Método 3: Buscar script de redirección
    const scriptRedirectMatch = html.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
    if (scriptRedirectMatch && scriptRedirectMatch[1]) {
      return scriptRedirectMatch[1];
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ Error al extraer URL de redirección:', error.message);
    return null;
  }
}

/**
 * Función para limpiar y validar los datos antes de guardarlos
 * @param {Object} data - Datos a limpiar y validar
 * @returns {Object} - Datos validados y limpios
 */
function cleanAndValidateData(data) {
  if (!data) return {};
  
  // Limpiar y asegurarse que solo haya una dirección por solicitante
  if (data.solicitantesInfo && data.solicitantesInfo.length > 0 && data.solicitantesInfo[0].solicitantes) {
    data.solicitantesInfo[0].solicitantes.forEach(solicitante => {
      if (solicitante.direccion) {
        // Eliminar "Dirección Física : " del inicio
        solicitante.direccion = solicitante.direccion.replace(/^Dirección Física : /, "");
        
        // Eliminar las comillas escapadas \"...\"
        solicitante.direccion = solicitante.direccion.replace(/\\"/g, "");
        
        // Si aún hay múltiples direcciones, tomar solo la primera
        if (solicitante.direccion.includes('Dirección Física :')) {
          const direcciones = solicitante.direccion.split('Dirección Física :');
          solicitante.direccion = direcciones[0].trim();
        }
      }
    });
  }
  
  // Truncar campos que podrían exceder los límites de MySQL
  if (data.refClient && data.refClient.length > 50) {
    data.refClient = data.refClient.substring(0, 50);
  }
  
  if (data.reivindicacionDeColores && data.reivindicacionDeColores.length > 1000) {
    data.reivindicacionDeColores = data.reivindicacionDeColores.substring(0, 1000);
  }
  
  // Asegurarse de que los datos de clase estén bien formateados
  if (data.multiclases && data.multiclases.clasesInfo) {
    data.multiclases.clasesInfo.forEach(clase => {
      // Truncar si es demasiado largo para MySQL TEXT (65535 caracteres)
      if (clase.descripcion && clase.descripcion.length > 65000) {
        clase.descripcion = clase.descripcion.substring(0, 65000);
      }
    });
  }
  
  // Asegurarse de que la información de prioridad esté correctamente formateada
  if (data.prioridadInfo && data.prioridadInfo.length > 0) {
    data.prioridadInfo.forEach(prioridad => {
      if (prioridad.numeroDePrioridad && prioridad.numeroDePrioridad.length > 50) {
        prioridad.numeroDePrioridad = prioridad.numeroDePrioridad.substring(0, 50);
      }
    });
  }
  
  return data;
}

/**
 * Inserta datos en MySQL para un solo expediente
 * @param {Object} data - Datos extraídos del expediente
 * @param {Object} config - Configuración de la base de datos
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function insertToSimPrecargaSingle(data, config) {
  let connection;
  
  try {
    console.log(`🔄 Iniciando inserción en MySQL para expediente individual: ${data.idsic || 'desconocido'}`);
    
    // Crear conexión a MySQL con reintentos
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        connection = await mysql.createConnection(config);
        console.log('✅ Conexión a MySQL establecida');
        break;
      } catch (connError) {
        retryCount++;
        console.error(`❌ Error al conectar a MySQL (intento ${retryCount}/${maxRetries}):`, connError.message);
        
        if (retryCount >= maxRetries) {
          throw new Error(`No se pudo establecer conexión después de ${maxRetries} intentos: ${connError.message}`);
        }
        
        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Iniciar transacción
    await connection.beginTransaction();
    console.log('🔄 Transacción iniciada');
    
    // Información del solicitante y contacto (acceso seguro a propiedades anidadas)
    const solicitante = data.solicitantesInfo && 
                      data.solicitantesInfo[0] && 
                      data.solicitantesInfo[0].solicitantes && 
                      data.solicitantesInfo[0].solicitantes[0] ? 
                      data.solicitantesInfo[0].solicitantes[0].fullName : null;
                      
    const dirsol = data.solicitantesInfo && 
                 data.solicitantesInfo[0] && 
                 data.solicitantesInfo[0].solicitantes && 
                 data.solicitantesInfo[0].solicitantes[0] ? 
                 data.solicitantesInfo[0].solicitantes[0].direccion : null;
                 
    const domsol = data.solicitantesInfo && 
                 data.solicitantesInfo[0] && 
                 data.solicitantesInfo[0].solicitantes && 
                 data.solicitantesInfo[0].solicitantes[0] ? 
                 data.solicitantesInfo[0].solicitantes[0].codPais : 'CO';
    
    // Información del contacto
    const hayContacto = data.solicitantesInfo && 
                      data.solicitantesInfo[0] && 
                      data.solicitantesInfo[0].contacto && 
                      data.solicitantesInfo[0].contacto.length > 0;
                      
    const hayApoderado = data.solicitantesInfo && 
                       data.solicitantesInfo[0] && 
                       data.solicitantesInfo[0].apoderado && 
                       data.solicitantesInfo[0].apoderado.length > 0;
    
    let nombreContacto, direccionContacto, paisContacto;
    
    if (hayContacto) {
      nombreContacto = data.solicitantesInfo[0].contacto[0].nombre || null;
      direccionContacto = data.solicitantesInfo[0].contacto[0].direccion || null;
      paisContacto = data.solicitantesInfo[0].contacto[0].pais || 'CO';
    } else if (hayApoderado) {
      nombreContacto = data.solicitantesInfo[0].apoderado[0].fullName || null;
      direccionContacto = data.solicitantesInfo[0].apoderado[0].direccion || null;
      paisContacto = data.solicitantesInfo[0].apoderado[0].codPais || 'CO';
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
    
    // Asegurarnos de que denominacionDelSigno exista
    const denominacion = data.denominacionDelSigno || '';
    const escapedDenominacion = escapeForSQL(denominacion);
    
    // Preparar datos para inserción según el formato de la tabla
    const insertData = {
      tiporeg: data.tipoSolicitud || 'SD Solicitud de Signos Distintivos',
      denominacion: escapedDenominacion || null,
      tipo_denomi: data.tipoDeSignoDistintivo || null,
      tipomarca: data.naturaleza || null,
      expediente: data.numeroSolicitud || null,
      fecha_solicitud: data.fechaRadicacion || null,
      solicitante: solicitante,
      dirsol: dirsol,
      domsol: domsol,
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
      media: Array.isArray(data.media) && data.media.length > 0 ? data.media[0] : null,
      reinvc: data.reivindicacionDeColores || null,
      vniza: esEnseñaONombreComercial ? '0' : (data.multiclases?.versionInfo?.version || '0'),
      codigos_viena: null
    };
    
    // Convertir valores undefined o vacíos a null
    Object.keys(insertData).forEach(key => {
      if (insertData[key] === undefined || insertData[key] === '') {
        insertData[key] = null;
      }
    });
    
    // Asegurarnos de que el idsic está presente
    if (!insertData.idsic) {
      console.warn('⚠️ Campo idsic faltante, usando numeroSolicitud como idsic');
      insertData.idsic = insertData.expediente || 'desconocido';
    }
    
    // Limitar longitud de campos críticos
    const maxLengths = {
      denominacion: 500,
      dirsol: 500,
      dirconta: 500,
      solicitante: 255,
      contacto: 255
    };
    
    Object.keys(maxLengths).forEach(field => {
      if (insertData[field] && typeof insertData[field] === 'string' && insertData[field].length > maxLengths[field]) {
        console.warn(`⚠️ Truncando campo ${field} de ${insertData[field].length} a ${maxLengths[field]} caracteres`);
        insertData[field] = insertData[field].substring(0, maxLengths[field]);
      }
    });
    
    // Registrar información antes de insertar
    console.log(`ℹ️ Datos a insertar para expediente ${insertData.idsic}:`);
    console.log(`- Tipo: ${insertData.tipo_denomi}`);
    console.log(`- Denominación: ${insertData.denominacion ? (insertData.denominacion.length > 30 ? insertData.denominacion.substring(0, 30) + '...' : insertData.denominacion) : 'N/A'}`);
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
    
    try {
      console.log('🔄 Ejecutando consulta INSERT/UPDATE en sim_precarga2_sic');
      const result = await connection.execute(sqlPrecarga, [
        insertData.tiporeg, insertData.denominacion, insertData.tipo_denomi, insertData.tipomarca, insertData.expediente,
        insertData.fecha_solicitud, insertData.solicitante, insertData.dirsol, insertData.domsol, insertData.contacto,
        insertData.dirconta, insertData.domconta, insertData.clases, insertData.gaceta, insertData.fecha_publicacion,
        insertData.prioridad, insertData.certi, insertData.vigencia, insertData.estado, insertData.idsic,
        insertData.regintal, insertData.media, insertData.reinvc, insertData.vniza, insertData.codigos_viena
      ]);
      
      console.log(`✅ Consulta ejecutada correctamente. Affected rows: ${result[0].affectedRows}`);
    } catch (sqlError) {
      console.error('❌ Error en la consulta SQL:', sqlError);
      
      // Intentar nuevamente la inserción con valores nulos para campos problemáticos
      if (sqlError.message && (sqlError.message.includes('too long') || sqlError.message.includes('Incorrect'))) {
        console.log('🔄 Reintentando la inserción con valores truncados...');
        
        // Truncar más severamente los campos que pueden ser demasiado largos
        if (insertData.denominacion && insertData.denominacion.length > 200) {
          insertData.denominacion = insertData.denominacion.substring(0, 200);
        }
        
        if (insertData.dirsol && insertData.dirsol.length > 200) {
          insertData.dirsol = insertData.dirsol.substring(0, 200);
        }
        
        if (insertData.dirconta && insertData.dirconta.length > 200) {
          insertData.dirconta = insertData.dirconta.substring(0, 200);
        }
        
        if (insertData.solicitante && insertData.solicitante.length > 100) {
          insertData.solicitante = insertData.solicitante.substring(0, 100);
        }
        
        if (insertData.contacto && insertData.contacto.length > 100) {
          insertData.contacto = insertData.contacto.substring(0, 100);
        }
        
        // Reintentar la consulta
        await connection.execute(sqlPrecarga, [
          insertData.tiporeg, insertData.denominacion, insertData.tipo_denomi, insertData.tipomarca, insertData.expediente,
          insertData.fecha_solicitud, insertData.solicitante, insertData.dirsol, insertData.domsol, insertData.contacto,
          insertData.dirconta, insertData.domconta, insertData.clases, insertData.gaceta, insertData.fecha_publicacion,
          insertData.prioridad, insertData.certi, insertData.vigencia, insertData.estado, insertData.idsic,
          insertData.regintal, insertData.media, insertData.reinvc, insertData.vniza, insertData.codigos_viena
        ]);
        
        console.log('✅ Consulta reintentada ejecutada correctamente');
      } else {
        throw sqlError;
      }
    }
    
    // 2. Insertar productos y servicios solo si hay clases definidas y no es enseña o nombre comercial
    if (!esEnseñaONombreComercial && data.multiclases?.clasesInfo?.length > 0) {
      console.log(`🔄 Procesando ${data.multiclases.clasesInfo.length} clases de productos y servicios`);
      
      for (const claseInfo of data.multiclases.clasesInfo) {
        const sqlProductos = `
          INSERT INTO precarga_pys_sim (numsol, idsic, nclas, descpys)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE descpys = VALUES(descpys)
        `;
        
        try {
          const descripcion = claseInfo.descripcion || '';
          // Limitar la longitud de la descripción
          const descpysLimitada = descripcion.length > 65000 ? descripcion.substring(0, 65000) : descripcion;
          
          await connection.execute(sqlProductos, [
            data.numeroSolicitud, data.idsic, claseInfo.clase, descpysLimitada
          ]);
          
          console.log(`✅ Insertada clase ${claseInfo.clase} para expediente ${data.idsic}`);
        } catch (clasesError) {
          console.warn(`⚠️ Error al insertar clase ${claseInfo.clase}:`, clasesError.message);
          // Continuamos con las siguientes clases
        }
      }
    } else {
      console.log('ℹ️ No hay clases para insertar o es una enseña/nombre comercial');
    }
    
    // Confirmar transacción
    await connection.commit();
    console.log(`✅ Transacción confirmada. Datos insertados con éxito para expediente ${data.idsic}`);
    
    return { success: true };
  } catch (error) {
    // Revertir transacción en caso de error
    if (connection) {
      try {
        await connection.rollback();
        console.log('🔄 Transacción revertida debido a error');
      } catch (rollbackError) {
        console.error('❌ Error adicional durante rollback:', rollbackError.message);
      }
    }
    
    console.error(`❌ Error al insertar datos en la base de datos para expediente individual:`, error);
    console.error(`Detalles: ${error.sqlMessage || error.message}`);
    
    return { success: false, error: error.message };
  } finally {
    if (connection) {
      try {
        await connection.end();
        console.log('🔄 Conexión a MySQL cerrada');
      } catch (closeError) {
        console.error('❌ Error al cerrar conexión MySQL:', closeError.message);
      }
    }
  }
}

/**
 * Escapa caracteres especiales para SQL
 * @param {string} str - Cadena a escapar
 * @returns {string} - Cadena escapada
 */
function escapeForSQL(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/'/g, "''");
}

module.exports = {
  processHtmlSingle,
  insertToSimPrecargaSingle
};