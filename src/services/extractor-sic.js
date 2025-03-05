// src/services/extractor-sic.js
/**
 * Extractor mejorado para datos de expedientes SIC
 */
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const mysql = require('mysql2/promise');

/**
 * Función principal para extraer datos del HTML de un expediente
 * @param {string} expediente - Identificador del expediente
 * @returns {Promise<Object>} - Datos extraídos en formato JSON
 */
/* async function extractDataWithErrorHandling(expediente) {
  try {
    // Leer el archivo HTML
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    const html = await fs.readFile(htmlPath, 'utf8');
    
    // Cargar el HTML en cheerio
    const $ = cheerio.load(html);
    
    // Extraer y formatear datos primero
    const fechaRadicacionOriginal = extraerSoloFecha(getFechaSolicitud($)) || '';
    const fechaPresentacionOriginal = getFechaPresentacion($) || '';
    const fechaOrdenPublicacionOriginal = getFechaOrdenPublicacion($) || '';
    const fechaPublicacionOriginal = getPublicacionInfo($).fechaPublicacion || '';
    const fechaRegistroOriginal = getFechaRegistro($) || '';
    const fechaRenovacionOriginal = getFechaRenovacion($) || '';
    const vigenciaOriginal = getVigencia($) || '';
    const fechaRegistroInternacionalOriginal = getFechaRegistroInternacional($) || '';
    
    // Obtener información de prioridad y formatear fechas
    const prioridadInfoOriginal = getPrioridadInfo($);
    const prioridadInfoFormateada = prioridadInfoOriginal.map(prioridad => {
      // Crear un nuevo objeto para no modificar el original
      return {
        ...prioridad,
        fechaDePrioridad: formatearFecha(prioridad.fechaDePrioridad) || prioridad.fechaDePrioridad
      };
    });
    
    console.log(`DEBUG - Fecha prioridad original: ${prioridadInfoOriginal[0]?.fechaDePrioridad}`);
    console.log(`DEBUG - Fecha prioridad formateada: ${prioridadInfoFormateada[0]?.fechaDePrioridad}`);

    // Crear la estructura exacta del JSON original con fechas formateadas
    const data = {
      idsic: expediente,
      refClient: getRefCliente($) || '',
      estado: getEstado($) || '',
      fechaRadicacion: formatearFecha(fechaRadicacionOriginal) || fechaRadicacionOriginal,
      numeroSolicitud: getNumeroSolicitud($) || '',
      fechaPresentacion: formatearFecha(fechaPresentacionOriginal) || fechaPresentacionOriginal,
      tipoSolicitud: getTipoSolicitud($) || 'SD Solicitud de Signos Distintivos',
      fechaOrdenPublicacion: formatearFecha(fechaOrdenPublicacionOriginal) || fechaOrdenPublicacionOriginal,
      
      // Objetos anidados como en el original
      publicacionInfo: {
        numeroGaceta: getPublicacionInfo($).numeroGaceta || '',
        fechaPublicacion: formatearFecha(fechaPublicacionOriginal) || fechaPublicacionOriginal
      },
      
      certificadoInfo: {
        certificado: getCertificado($) || '',
        fechaRegistro: formatearFecha(fechaRegistroOriginal) || fechaRegistroOriginal,
        fechaRenovacion: formatearFecha(fechaRenovacionOriginal) || fechaRenovacionOriginal,
        vigencia: formatearFecha(vigenciaOriginal) || vigenciaOriginal
      },
      
      registroInternacionalInfo: {
        numeroRegistroInternacional: getNumeroRegistroInternacional($) || '',
        fechaRegistroInternacional: formatearFecha(fechaRegistroInternacionalOriginal) || fechaRegistroInternacionalOriginal
      },
      
      solicitantesInfo: [
        {
          representantesInternacionales: getRepresentanteInternacionalInfo($) || [],
          solicitantes: getSolicitantesInfo($) || [],
          contacto: getContactoInfo($) || []
        }
      ],
      
      prioridadInfo: prioridadInfoFormateada,
      
      solicitantesInfo: [
        {
          representantesInternacionales: getRepresentanteInternacionalInfo($) || [],
          solicitantes: getSolicitantesInfo($) || [],
          contacto: getContactoInfo($) || []
        }
      ],
      
      prioridadInfo: getPrioridadInfo($) || [],
      
      multiclases: {
        clasesInfo: getClasesInfo($) || [],
        versionInfo: {
          version: getVersionNiza($) || '',
          clases: getClasesString($) || ''
        }
      },
      
      // Agregar datos del signo distintivo
      reivindicaColorDistintivo: getReivindicaColorDistintivo($) || false,
      caracteresEstandar: getCaracteresEstandar($) || false,
      tipoDeSignoDistintivo: getTipoSignoDistintivo($) || '',
      naturaleza: getNaturaleza($) || '',
      denominacionDelSigno: getDenominacion($) || '',
      reivindicacionDeColores: getReivindicacionColores($) || '',
      media: getImagenUrl($) ? [getImagenUrl($)] : [],
      
      // Agregar transliteración y traducción
      transliteracion: getTransliteracion($) || '',
      traduccionEspanol: getTraduccionEspanol($) || ''
    };
    
    // Agregar redirección si existe
    const redirectMatch = html.match(/<div id="first-redirect-url">First Redirect URL: <a href="([^"]+)"/);
    if (redirectMatch && redirectMatch[1]) {
      data.redirectUrl = redirectMatch[1];
      
      // Extraer idProc si está disponible
      const idProcMatch = redirectMatch[1].match(/idProc=([0-9]+)/);
      if (idProcMatch && idProcMatch[1]) {
        data.idProc = idProcMatch[1];
      }
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error al extraer datos para ${expediente}:`, error);
    throw error;
  }
} */

  /**
 * Función principal para extraer datos del HTML de un expediente
 * @param {string} expediente - Identificador del expediente
 * @returns {Promise<Object>} - Datos extraídos en formato JSON
 */
async function extractDataWithErrorHandling(expediente) {
  try {
    // Leer el archivo HTML
    const htmlPath = path.join(process.cwd(), 'origen', `${expediente}.html`);
    const html = await fs.readFile(htmlPath, 'utf8');
    
    // Cargar el HTML en cheerio
    const $ = cheerio.load(html);
    
    // Extraer información de prioridad con fechas ya formateadas
    const prioridadInfo = getPrioridadInfo($);
    
    // Crear la estructura del JSON
    const data = {
      idsic: expediente,
      refClient: getRefCliente($) || '',
      estado: getEstado($) || '',
      fechaRadicacion: formatearFecha(getFechaSolicitud($)) || getFechaSolicitud($) || '',
      numeroSolicitud: getNumeroSolicitud($) || '',
      fechaPresentacion: formatearFecha(getFechaPresentacion($)) || getFechaPresentacion($) || '',
      tipoSolicitud: getTipoSolicitud($) || 'SD Solicitud de Signos Distintivos',
      fechaOrdenPublicacion: formatearFecha(getFechaOrdenPublicacion($)) || getFechaOrdenPublicacion($) || '',
      
      // Objetos anidados como en el original
      publicacionInfo: {
        numeroGaceta: getPublicacionInfo($).numeroGaceta || '',
        fechaPublicacion: formatearFecha(getPublicacionInfo($).fechaPublicacion) || getPublicacionInfo($).fechaPublicacion || ''
      },
      
      certificadoInfo: {
        certificado: getCertificado($) || '',
        fechaRegistro: formatearFecha(getFechaRegistro($)) || getFechaRegistro($) || '',
        fechaRenovacion: formatearFecha(getFechaRenovacion($)) || getFechaRenovacion($) || '',
        vigencia: formatearFecha(getVigencia($)) || getVigencia($) || ''
      },
      
      registroInternacionalInfo: {
        numeroRegistroInternacional: getNumeroRegistroInternacional($) || '',
        fechaRegistroInternacional: formatearFecha(getFechaRegistroInternacional($)) || getFechaRegistroInternacional($) || ''
      },
      
      solicitantesInfo: [
        {
          representantesInternacionales: getRepresentanteInternacionalInfo($) || [],
          solicitantes: getSolicitantesInfo($) || [],
          contacto: getContactoInfo($) || []
        }
      ],
      
      prioridadInfo: prioridadInfo, // Usar la info de prioridad con fechas ya formateadas
      
      multiclases: {
        clasesInfo: getClasesInfo($) || [],
        versionInfo: {
          version: getVersionNiza($) || '',
          clases: getClasesString($) || ''
        }
      },
      
      // Agregar datos del signo distintivo
      reivindicaColorDistintivo: getReivindicaColorDistintivo($) || false,
      caracteresEstandar: getCaracteresEstandar($) || false,
      tipoDeSignoDistintivo: getTipoSignoDistintivo($) || '',
      naturaleza: getNaturaleza($) || '',
      denominacionDelSigno: getDenominacion($) || '',
      reivindicacionDeColores: getReivindicacionColores($) || '',
      media: getImagenUrl($) ? [getImagenUrl($)] : [],
      
      // Agregar transliteración y traducción
      transliteracion: getTransliteracion($) || '',
      traduccionEspanol: getTraduccionEspanol($) || ''
    };
    
    // Agregar redirección si existe
    const redirectMatch = html.match(/<div id="first-redirect-url">First Redirect URL: <a href="([^"]+)"/);
    if (redirectMatch && redirectMatch[1]) {
      data.redirectUrl = redirectMatch[1];
      
      // Extraer idProc si está disponible
      const idProcMatch = redirectMatch[1].match(/idProc=([0-9]+)/);
      if (idProcMatch && idProcMatch[1]) {
        data.idProc = idProcMatch[1];
      }
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error al extraer datos para ${expediente}:`, error);
    throw error;
  }
}

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
    
    // Preparar datos para inserción según el formato de la tabla
    const insertData = {
      tiporeg: data.tipoSolicitud || null,
      denominacion: data.denominacionDelSigno || null,
      tipo_denomi: data.tipoDeSignoDistintivo || null,
      tipomarca: data.naturaleza || null,
      expediente: data.numeroSolicitud || null,
      fecha_solicitud: data.fechaRadicacion || null,
      solicitante: data.solicitantesInfo[0]?.solicitantes[0]?.fullName || null,
      dirsol: data.solicitantesInfo[0]?.solicitantes[0]?.direccion || null,
      domsol: data.solicitantesInfo[0]?.solicitantes[0]?.codPais || 'CO',
      contacto: data.solicitantesInfo[0]?.contacto[0]?.nombre || null,
      dirconta: data.solicitantesInfo[0]?.contacto[0]?.direccion || null,
      domconta: data.solicitantesInfo[0]?.contacto[0]?.pais || 'CO',
      // Asignación de valores predeterminados para clases según tipo
      clases: esEnseñaONombreComercial ? '0' : (data.multiclases?.versionInfo?.clases || '0'),
      gaceta: data.publicacionInfo?.numeroGaceta || null,
      fecha_publicacion: data.publicacionInfo?.fechaPublicacion || null,
      prioridad: prioridadFormateada || null,
      certi: data.certificadoInfo?.certificado || null,
      vigencia: data.certificadoInfo?.vigencia || null,
      estado: data.estado || null,
      idsic: data.idsic || null,
      regintal: data.registroInternacionalInfo?.numeroRegistroInternacional || null,
      media: data.media?.[0] || null,
      reinvc: data.reivindicacionDeColores || null,
      // Asignación de valores predeterminados para versión Niza según tipo
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

/* 
async function insertToSimPrecarga(data, config) {
  const connection = await mysql.createConnection(config);
  
  try {
    // Iniciar transacción
    await connection.beginTransaction();
    
    // Formatear prioridades para la inserción en base de datos - formato conciso como se solicitó
    let prioridadFormateada = '';
    if (data.prioridadInfo && data.prioridadInfo.length > 0) {
      // Crear una cadena formateada con todas las prioridades en formato PAÍS | FECHA | NÚMERO
      prioridadFormateada = data.prioridadInfo.map(p => 
        `${p.pais} | ${p.fechaDePrioridad} | ${p.numeroDePrioridad}`
      ).join(' # ');
      
      // Asegurarnos de que no exceda el tamaño máximo de la columna (por seguridad, asumimos 255 caracteres)
      if (prioridadFormateada.length > 250) {
        prioridadFormateada = prioridadFormateada.substring(0, 250);
      }
    }
    
    // Resto del código de inserción...
    // Preparar datos para inserción según el formato de la tabla
    const insertData = {
      tiporeg: data.tipoSolicitud || null,
      denominacion: data.denominacionDelSigno || null,
      tipo_denomi: data.tipoDeSignoDistintivo || null,
      tipomarca: data.naturaleza || null,
      expediente: data.numeroSolicitud || null,
      fecha_solicitud: data.fechaRadicacion || null,
      solicitante: data.solicitantesInfo[0]?.solicitantes[0]?.fullName || null,
      dirsol: data.solicitantesInfo[0]?.solicitantes[0]?.direccion || null,
      domsol: data.solicitantesInfo[0]?.solicitantes[0]?.codPais || 'CO',
      contacto: data.solicitantesInfo[0]?.contacto[0]?.nombre || null,
      dirconta: data.solicitantesInfo[0]?.contacto[0]?.direccion || null,
      domconta: data.solicitantesInfo[0]?.contacto[0]?.pais || 'CO',
      clases: data.multiclases?.versionInfo?.clases || null,
      gaceta: data.publicacionInfo?.numeroGaceta || null,
      fecha_publicacion: data.publicacionInfo?.fechaPublicacion || null,
      prioridad: prioridadFormateada || null,
      certi: data.certificadoInfo?.certificado || null,
      vigencia: data.certificadoInfo?.vigencia || null,
      estado: data.estado || null,
      idsic: data.idsic || null,
      regintal: data.registroInternacionalInfo?.numeroRegistroInternacional || null,
      media: data.media?.[0] || null,
      reinvc: data.reivindicacionDeColores || null,
      vniza: data.multiclases?.versionInfo?.version || null,
      codigos_viena: null
    };
    
    // Convertir valores undefined a null
    Object.keys(insertData).forEach(key => {
      if (insertData[key] === undefined) {
        insertData[key] = null;
      }
    });
    
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
    
    // 2. Insertar productos y servicios
    if (data.multiclases?.clasesInfo?.length > 0) {
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
    
    return { success: false, error: error.message };
  } finally {
    await connection.end();
  }
} */

// Funciones auxiliares para extraer datos específicos

function getRefCliente($) {
  return $('#MainContent_ctrlTM_trReference .data').text().trim() ||
         $('#MainContent_ctrlIRD_lblReference').text().trim() ||
         $('#MainContent_ctrlIRA_lblReference').text().trim() ||
         $('td.label:contains("Referencia del solicitante")').next('td.data').text().trim();
}

function getEstado($) {
  return $('#MainContent_ctrlTM_lblCurrentStatus').text().trim() ||
         $('#MainContent_ctrlIRD_lblCurrentStatus').text().trim() ||
         $('#MainContent_ctrlIRA_lblCurrentStatus').text().trim() ||
         $('td.label:contains("Estado")').next('td.data').text().trim();
}

function getFechaSolicitud($) {
  return $('label#MainContent_ctrlTM_lblDtSubmittedDate').parent().next().text().trim() ||
         $('#MainContent_ctrlTM_trDtSubmittedDate .data').text().trim() ||
         $('label#MainContent_ctrlIRD_lblDtSubmittedDate').parent().next().text().trim() ||
         $('.twoCol').find('td.label:contains("Fecha de radicación")').next('td.data').text().trim();
}

function getNumeroSolicitud($) {
  return $('#MainContent_ctrlTM_txtAppNr').text().trim() ||
         $('#MainContent_ctrlIRD_txtAppNr').text().trim() ||
         $('#MainContent_ctrlIRA_txtAppNr').text().trim() ||
         $('.twoCol').find('td.label:contains("Número de Solicitud")').next('.data').text().trim();
}

function getFechaPresentacion($) {
  // Buscar más específicamente para evitar tomar contenido mixto
  let fechaPresentacion = '';
  
  // Opción 1: Buscar específicamente por la etiqueta
  const dtFiledLabel = $('label#MainContent_ctrlTM_lblDtFiled');
  if (dtFiledLabel.length) {
    fechaPresentacion = dtFiledLabel.parent().next('.data').text().trim();
  }
  
  // Opción 2: Buscar por el texto de la etiqueta
  if (!fechaPresentacion) {
    const labelCell = $('td.label:contains("Fecha de Presentación")');
    if (labelCell.length) {
      fechaPresentacion = labelCell.next('td.data').text().trim();
    }
  }
  
  // Opción 3: Extraer de una tabla genérica
  if (!fechaPresentacion) {
    const fechaCell = $('.twoCol').find('td:contains("Fecha de Presentación")').next();
    if (fechaCell.length) {
      fechaPresentacion = fechaCell.text().trim();
    }
  }
  
  return extraerSoloFecha(fechaPresentacion);
}

function getTipoSolicitud($) {
  // Buscar el tipo de solicitud de manera más específica
  let tipoSolicitud = '';
  
  // Extraer sólo el tipo, no cualquier texto adicional
  const tipoLabel = $('td.label:contains("Tipo de solicitud")');
  if (tipoLabel.length) {
    tipoSolicitud = tipoLabel.next('td.data').text().trim();
    // Asegurarnos de que solo obtenemos el tipo de solicitud
    if (tipoSolicitud.includes("Solicitud de Signos Distintivos")) {
      tipoSolicitud = "SD Solicitud de Signos Distintivos";
    }
  }
  
  if (!tipoSolicitud) {
    // Fallback a valores específicos
    tipoSolicitud = $('#MainContent_ctrlTM_trDtAcceptance .data').text().trim() ||
                   $('#MainContent_ctrlIRD_trDtAcceptance .data').text().trim() ||
                   $('#MainContent_ctrlIRA_trDtAcceptance .data').text().trim();
    
    // Si aún no tenemos tipo, usar el valor por defecto
    if (!tipoSolicitud || tipoSolicitud.includes("Fecha")) {
      tipoSolicitud = "SD Solicitud de Signos Distintivos";
    }
  }
  
  return tipoSolicitud;
}

function getFechaOrdenPublicacion($) {
  // Buscar la fecha de orden de publicación más específicamente
  let fechaOrden = '';
  
  // Opción 1: Buscar por la etiqueta específica
  const acceptanceLabel = $('label#MainContent_ctrlTM_lblDtAcceptance');
  if (acceptanceLabel.length) {
    fechaOrden = acceptanceLabel.parent().next('.data').text().trim();
  }
  
  // Opción 2: Buscar por el texto de la etiqueta
  if (!fechaOrden) {
    const labelCell = $('td.label:contains("Fecha de orden de publicación")');
    if (labelCell.length) {
      fechaOrden = labelCell.next('td.data').text().trim();
    }
  }
  
  // Opción 3: Buscar en el texto de un campo relacionado
  if (!fechaOrden) {
    fechaOrden = $('#MainContent_ctrlTM_trDtAcceptance .data').text().trim();
  }
  
  return extraerSoloFecha(fechaOrden);
}

function getPublicacionInfo($) {
  // Información de gaceta y publicación
  let numeroGaceta = $('#MainContent_ctrlTM_trPublish .data').first().text().trim() ||
                     $('#MainContent_ctrlIRD_trPublish .data').first().text().trim() ||
                     $('td.label:contains("Número de la gaceta")').next('td.data').text().trim();
                     
  let fechaPublicacion = $('#MainContent_ctrlTM_trPublish .data').last().text().trim() ||
                         $('#MainContent_ctrlIRD_trPublish .data').last().text().trim() ||
                         $('td.label:contains("Fecha de publicación")').next('td.data').text().trim();
  
  return {
    numeroGaceta,
    fechaPublicacion
  };
}

function getCertificado($) {
  return $('#MainContent_ctrlTM_trDtRegistration .data').first().text().trim() || 
         $('#MainContent_ctrlIRD_txtIdRegistration').text().trim();
}

function getFechaRegistro($) {
  return $('#MainContent_ctrlTM_trDtRegistration .data').last().text().trim() ||
         $('#MainContent_ctrlIRD_lblDtRegistration').parent().next('.data').text().trim();
}

function getFechaRenovacion($) {
  return $('#MainContent_ctrlIRD_lblDtRenewal').parent().next('.data').text().trim();
}

function getVigencia($) {
  return $('#MainContent_ctrlTM_trDtExpiration .data').last().text().trim() ||
         $('#MainContent_ctrlIRD_lblDtExpiration').parent().next('.data').text().trim();
}

function getNumeroRegistroInternacional($) {
  return $('#MainContent_ctrlIRD_txtIntIdRegistration').text().trim();
}

function getFechaRegistroInternacional($) {
  return $('#MainContent_ctrlIRD_lblDtRegistrationWIPO').parent().next('.data').text().trim();
}


/**
 * Obtiene información de representantes internacionales
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con información de representantes internacionales
 */
function getRepresentanteInternacionalInfo($) {
  const representantes = [];
  
  // Seleccionar todas las filas de representantes
  $('#MainContent_ctrlIRD_ctrlApplicant_ctrlWIPORepresentative_gvCustomers tr.alt1').each(function() {
    const representante = {};
    
    representante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    const nombre = $(this).find('td').eq(2).text().trim();
    const apellido = $(this).find('td').eq(3).text().trim();
    
    // Normalizar el nombre completo: eliminar espacios innecesarios y convertir a mayúsculas
    representante.fullName = normalizeText(apellido ? `${nombre} ${apellido}` : nombre);
    
    representantes.push(representante);
  });
  
  return representantes;
}


/* function getRepresentanteInternacionalInfo($) {
  const representantes = [];
  
  // Seleccionar todas las filas de representantes
  $('#MainContent_ctrlIRD_ctrlApplicant_ctrlWIPORepresentative_gvCustomers tr.alt1').each(function() {
    const representante = {};
    
    representante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    representante.nombre = $(this).find('td').eq(2).text().trim();
    representante.apellido = $(this).find('td').eq(3).text().trim();
    
    representantes.push(representante);
  });
  
  return representantes;
} */

/**
 * Obtiene información del representante o apoderado
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con información de representantes/apoderados
 */
function getRepresentanteInfo($) {
  const representantes = [];
  
  // Buscar en la tabla de apoderados
  $('#MainContent_ctrlTM_ctrlApplicant_ctrlAgent_gvCustomers tr.alt1, #MainContent_ctrlIRD_ctrlApplicant_ctrlAgent_gvCustomers tr.alt1').each(function() {
    const representante = {};
    
    representante.numeroIdentificacion = $(this).find('td').eq(0).text().trim();
    representante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    
    const nombre = $(this).find('td').eq(2).text().trim();
    const apellido = $(this).find('td').eq(3).text().trim();
    
    // Normalizar el nombre completo: eliminar espacios innecesarios y convertir a mayúsculas
    representante.fullName = normalizeText(apellido ? `${nombre} ${apellido}` : nombre);
    
    let direccion = $(this).find('td').eq(4).text().trim();
    direccion = direccion.replace('Dirección Física : ', '');
    representante.direccion = direccion;
    
    representantes.push(representante);
  });
  
  return representantes;
}

/* function getSolicitantesInfo($) {
  const solicitantes = [];
  
  // Primera opción
  let solicitanteRows = $('#MainContent_ctrlIRD_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  
  // Segunda opción
  if (solicitanteRows.length === 0) {
    solicitanteRows = $('#MainContent_ctrlTM_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  }
  
  // Tercera opción
  if (solicitanteRows.length === 0) {
    solicitanteRows = $('#MainContent_ctrlIRA_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  }
  
  solicitanteRows.each(function() {
    const solicitante = {};
    
    solicitante.numeroIdentificacion = $(this).find('td').eq(0).text().trim();
    
    if (solicitante.numeroIdentificacion.includes('Mostrar / Ocultar columnas')) {
      return;
    }
    
    solicitante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    
    // Pueden haber diferentes columnas dependiendo del expediente
    const tdCount = $(this).find('td').length;
    let nombreIdx = 1;
    let apellidoIdx = 2;
    let direccionIdx = 3;
    
    if (tdCount > 4) {
      nombreIdx = 2;
      apellidoIdx = 3;
      direccionIdx = 4;
    }
    
    const nombre = $(this).find('td').eq(nombreIdx).text().trim();
    const apellido = tdCount > apellidoIdx ? $(this).find('td').eq(apellidoIdx).text().trim() : '';
    solicitante.fullName = apellido ? `${nombre} ${apellido}` : nombre;
    
    let direccion = $(this).find('td').eq(direccionIdx).text().trim() || 
                  $(this).find('td').last().text().trim();
    direccion = direccion.replace('Dirección Física : ', '');
    solicitante.direccion = direccion;
    
    const match = direccion.match(/\(([^)]+)\)$/);
    if (match) {
      solicitante.codPais = match[1];
    } else {
      solicitante.codPais = 'CO'; // Por defecto
    }
    
    solicitantes.push(solicitante);
  });
  
  return solicitantes;
} */

  /**
 * Normaliza un texto: elimina espacios innecesarios y convierte a mayúsculas
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
function normalizeText(text) {
  if (!text) return '';
  
  // Eliminar espacios al inicio y al final y convertir a mayúsculas
  return text.trim().toUpperCase();
}

/**
 * Obtiene información de los solicitantes
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con información de solicitantes
 */
function getSolicitantesInfo($) {
  const solicitantes = [];
  
  // Primera opción
  let solicitanteRows = $('#MainContent_ctrlIRD_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  
  // Segunda opción
  if (solicitanteRows.length === 0) {
    solicitanteRows = $('#MainContent_ctrlTM_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  }
  
  // Tercera opción
  if (solicitanteRows.length === 0) {
    solicitanteRows = $('#MainContent_ctrlIRA_ctrlApplicant_ctrlApplicant_gvCustomers tr.alt1');
  }
  
  solicitanteRows.each(function() {
    const solicitante = {};
    
    solicitante.numeroIdentificacion = $(this).find('td').eq(0).text().trim();
    
    if (solicitante.numeroIdentificacion.includes('Mostrar / Ocultar columnas')) {
      return;
    }
    
    solicitante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    
    // Pueden haber diferentes columnas dependiendo del expediente
    const tdCount = $(this).find('td').length;
    let nombreIdx = 1;
    let apellidoIdx = 2;
    let direccionIdx = 3;
    
    if (tdCount > 4) {
      nombreIdx = 2;
      apellidoIdx = 3;
      direccionIdx = 4;
    }
    
    const nombre = $(this).find('td').eq(nombreIdx).text().trim();
    const apellido = tdCount > apellidoIdx ? $(this).find('td').eq(apellidoIdx).text().trim() : '';
    
    // Normalizar el nombre completo: eliminar espacios innecesarios y convertir a mayúsculas
    solicitante.fullName = normalizeText(apellido ? `${nombre} ${apellido}` : nombre);
    
    let direccion = $(this).find('td').eq(direccionIdx).text().trim() || 
                  $(this).find('td').last().text().trim();
    direccion = direccion.replace('Dirección Física : ', '');
    solicitante.direccion = direccion;
    
    const match = direccion.match(/\(([^)]+)\)$/);
    if (match) {
      solicitante.codPais = match[1];
    } else {
      solicitante.codPais = 'CO'; // Por defecto
    }
    
    solicitantes.push(solicitante);
  });
  
  return solicitantes;
}

/**
 * Obtiene información de contacto
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con información de contacto
 */
function getContactoInfo($) {
  const contactos = [];
  
  // Seleccionar filas de contacto
  $('#MainContent_ctrlTM_ctrlApplicant_ctrlAddressForService_gvAddresses tr, #MainContent_ctrlIRD_ctrlApplicant_ctrlAddressForService_gvAddresses tr').each(function(i) {
    if (i === 1) { // Primera fila después del encabezado
      const contacto = {};
      
      const tds = $(this).find('td');
      contacto.numeroIdentificacion = tds.eq(0).text().trim();
      contacto.nombre = normalizeText(tds.eq(1).text().trim()); // Normalizar nombre
      contacto.direccion = tds.eq(2).text().trim();
      contacto.ciudad = tds.eq(3).text().trim();
      contacto.codigoPostal = tds.eq(4).text().trim();
      contacto.pais = tds.eq(5).text().trim();
      contacto.tipoDireccion = tds.eq(6).text().trim();
      
      contactos.push(contacto);
    }
  });
  
  return contactos;
}


/* 
function getContactoInfo($) {
  const contactos = [];
  
  // Seleccionar filas de contacto
  $('#MainContent_ctrlTM_ctrlApplicant_ctrlAddressForService_gvAddresses tr, #MainContent_ctrlIRD_ctrlApplicant_ctrlAddressForService_gvAddresses tr').each(function(i) {
    if (i === 1) { // Primera fila después del encabezado
      const contacto = {};
      
      const tds = $(this).find('td');
      contacto.numeroIdentificacion = tds.eq(0).text().trim();
      contacto.nombre = tds.eq(1).text().trim();
      contacto.direccion = tds.eq(2).text().trim();
      contacto.ciudad = tds.eq(3).text().trim();
      contacto.codigoPostal = tds.eq(4).text().trim();
      contacto.pais = tds.eq(5).text().trim();
      contacto.tipoDireccion = tds.eq(6).text().trim();
      
      contactos.push(contacto);
    }
  });
  
  return contactos;
} */

/**
 * Obtiene información de prioridad del expediente
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array de objetos con información de prioridad
 */

/* function getPrioridadInfo($) {
  const prioridades = [];
  
  console.log('DEBUG - Buscando información de prioridad...');
  
  // Selector específico para la tabla de prioridades
  const selector = '#MainContent_ctrlTM_ctrlConvPrio_gvwPriorityList tr.alt1';
  
  // Iterar por las filas de prioridad
  $(selector).each(function() {
    const columns = $(this).find('td');
    if (columns.length >= 3) {
      const pais = columns.eq(0).text().trim();
      const fechaDePrioridadOriginal = columns.eq(1).text().trim();
      const numeroDePrioridad = columns.eq(2).text().trim();
      const clase = columns.length > 3 ? columns.eq(3).text().trim() : '';
      const reivindicaciones = columns.length > 4 ? columns.eq(4).text().trim() : '';
      
      console.log(`DEBUG - Encontrada prioridad: ${pais}, ${fechaDePrioridadOriginal}, ${numeroDePrioridad}, ${clase}`);
      
      // Solo agregar si tenemos datos significativos y parece una prioridad real
      if (pais && fechaDePrioridadOriginal && numeroDePrioridad && 
          !pais.includes('Solicitud') && !pais.includes('Contacto') && 
          !pais.includes('Número de la gaceta')) {
        
        // Formatear la fecha antes de agregarla al objeto
        const fechaFormateada = formatearFecha(fechaDePrioridadOriginal);
        
        const prioridad = {
          pais: pais,
          fechaDePrioridad: fechaFormateada || fechaDePrioridadOriginal, // Usar la formateada o la original como fallback
          numeroDePrioridad: numeroDePrioridad,
          clase: clase,
          reivindicaciones: reivindicaciones
        };
        
        prioridades.push(prioridad);
      }
    }
  });
  
  // Log para depuración
  console.log(`DEBUG - Total de prioridades válidas encontradas: ${prioridades.length}`);
  
  return prioridades;
} */

/**
 * Obtiene información de prioridad del expediente
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array de objetos con información de prioridad con fechas ya formateadas
 */
function getPrioridadInfo($) {
  const prioridades = [];
  
  console.log('DEBUG - Buscando información de prioridad...');
  
  // Selector específico para la tabla de prioridades - capturar TODAS las filas (no solo alt1)
  const selector = '#MainContent_ctrlTM_ctrlConvPrio_gvwPriorityList tr';
  
  // Iterar por las filas de prioridad
  $(selector).each(function(index) {
    // Saltamos la primera fila (index 0) que es el encabezado de la tabla
    if (index === 0) return;
    
    // También saltamos las filas de paginación si tienen la clase 'gridview_pager'
    if ($(this).hasClass('gridview_pager')) return;
    
    const columns = $(this).find('td');
    if (columns.length >= 3) {
      const pais = columns.eq(0).text().trim();
      const fechaDePrioridadOriginal = columns.eq(1).text().trim();
      const numeroDePrioridad = columns.eq(2).text().trim();
      const clase = columns.length > 3 ? columns.eq(3).text().trim() : '';
      const reivindicaciones = columns.length > 4 ? columns.eq(4).text().trim() : '';
      
      console.log(`DEBUG - Encontrada prioridad: ${pais}, ${fechaDePrioridadOriginal}, ${numeroDePrioridad}, ${clase}`);
      
      // Solo agregar si tenemos datos significativos
      if (pais && fechaDePrioridadOriginal && numeroDePrioridad) {
        // Formatear la fecha antes de agregarla al objeto
        const fechaFormateada = formatearFecha(fechaDePrioridadOriginal);
        
        const prioridad = {
          pais: pais,
          fechaDePrioridad: fechaFormateada || fechaDePrioridadOriginal, // Usar la formateada o la original como fallback
          numeroDePrioridad: numeroDePrioridad,
          clase: clase,
          reivindicaciones: reivindicaciones
        };
        
        prioridades.push(prioridad);
      }
    }
  });
  
  // Si no encontramos prioridades con el selector principal, probemos un selector alternativo
  if (prioridades.length === 0) {
    // Selector alternativo para marcas internacionales
    const selectorAlt = '#MainContent_ctrlIRD_tblPriority tr.alt1';
    
    $(selectorAlt).each(function() {
      const columns = $(this).find('td');
      if (columns.length >= 3) {
        const pais = columns.eq(0).text().trim();
        const fechaDePrioridadOriginal = columns.eq(1).text().trim();
        const numeroDePrioridad = columns.eq(2).text().trim();
        const clase = columns.length > 3 ? columns.eq(3).text().trim() : '';
        const reivindicaciones = columns.length > 4 ? columns.eq(4).text().trim() : '';
        
        console.log(`DEBUG - Encontrada prioridad alternativa: ${pais}, ${fechaDePrioridadOriginal}, ${numeroDePrioridad}, ${clase}`);
        
        // Solo agregar si tenemos datos significativos
        if (pais && fechaDePrioridadOriginal && numeroDePrioridad) {
          // Formatear la fecha antes de agregarla al objeto
          const fechaFormateada = formatearFecha(fechaDePrioridadOriginal);
          
          const prioridad = {
            pais: pais,
            fechaDePrioridad: fechaFormateada || fechaDePrioridadOriginal,
            numeroDePrioridad: numeroDePrioridad,
            clase: clase,
            reivindicaciones: reivindicaciones
          };
          
          prioridades.push(prioridad);
        }
      }
    });
  }
  
  // Log para depuración
  console.log(`DEBUG - Total de prioridades encontradas: ${prioridades.length}`);
  
  return prioridades;
}

function getClasesInfo($) {
  const clasesInfo = [];
  
  $('#MainContent_ctrlTM_ctrlClassif_gvClassifications tr, #MainContent_ctrlIRD_ctrlClassif_gvClassifications tr').each((i, row) => {
    if (i > 0 && !$(row).hasClass('gridview_pager')) {
      const tds = $(row).find('td');
      if (tds.length >= 2) {
        const clase = $(tds[0]).text().trim();
        const descripcion = $(tds[1]).text().trim();
        
        if (clase && descripcion) {
          clasesInfo.push({
            clase: clase,
            descripcion: descripcion
          });
        }
      }
    }
  });
  
  return clasesInfo;
}

function getClasesString($) {
  const clases = [];
  
  $('#MainContent_ctrlTM_ctrlClassif_gvClassifications tr, #MainContent_ctrlIRD_ctrlClassif_gvClassifications tr').each((i, row) => {
    if (i > 0 && !$(row).hasClass('gridview_pager')) {
      const tds = $(row).find('td');
      if (tds.length >= 1) {
        const clase = $(tds[0]).text().trim();
        if (clase && !isNaN(clase)) {
          clases.push(clase);
        }
      }
    }
  });
  
  return clases.join(', ');
}

function getVersionNiza($) {
  // Array para almacenar todas las versiones encontradas
  const versiones = [];
  
  // Intentar con selectores específicos
  const versionTM = $('#MainContent_ctrlTM_trNiceclassificationSchedule .data').text().trim();
  if (versionTM) versiones.push(versionTM);
  
  const versionIRD = $('#MainContent_ctrlIRD_trNiceclassificationSchedule .data').text().trim();
  if (versionIRD) versiones.push(versionIRD);
  
  const versionIRA = $('#MainContent_ctrlIRA_trNiceclassificationSchedule .data').text().trim();
  if (versionIRA) versiones.push(versionIRA);
  
  // También buscar con selectores genéricos
  $('td.label').each(function() {
    const label = $(this).text().trim().toLowerCase();
    if (label.includes('versión') && label.includes('niza')) {
      const version = $(this).next('td.data').text().trim();
      if (version) versiones.push(version);
    }
  });
  
  // Si encontramos versiones, seleccionar la primera no vacía y limpiarla
  if (versiones.length > 0) {
    // Filtrar versiones vacías
    const versionesFiltradas = versiones.filter(v => v && v.trim() !== '');
    
    if (versionesFiltradas.length > 0) {
      // Tomar la primera versión y limpiarla
      let version = versionesFiltradas[0];
      
      // Eliminar texto extra y dejar solo números si es necesario
      if (version.includes(" ")) {
        version = version.replace(/[^\d]/g, '');
      }
      
      return version;
    }
  }
  
  return '';
}

function getReivindicaColorDistintivo($) {
  // Verificar si el botón de radio "Sí" está marcado
  const colorClaimYes = $('#MainContent_ctrlTM_rbtnColor_0').is(':checked');
  const colorClaimIndicator = $('#MainContent_ctrlIRD_cbColorClaimIndicator').is(':checked');
  
  // También verificar si hay contenido en el div de colores
  const colorText = $('#MainContent_ctrlTM_divColorTxt').text().trim();
  
  // Si cualquiera de estas condiciones es verdadera, se reivindica color
  return !!(colorClaimYes || colorClaimIndicator || colorText);
}

function getCaracteresEstandar($) {
  return $('#MainContent_ctrlIRD_cbDeclaration').is(':checked');
}

function getTipoSignoDistintivo($) {
  return $('#MainContent_ctrlTM_trTMNature .data').text().trim() ||
         $('#MainContent_ctrlIRD_trTMNature .data').text().trim() ||
         $('#MainContent_ctrlIRA_trTMNature .data').text().trim() ||
         $('td.label:contains("Tipo de Signo")').next('td.data').text().trim() ||
         'Marca';
}

function getNaturaleza($) {
  return $('#MainContent_ctrlTM_trTMType .data').text().trim() ||
         $('#MainContent_ctrlIRD_trTMType .data').text().trim() ||
         $('#MainContent_ctrlIRA_trTMType .data').text().trim() ||
         $('td.label:contains("Naturaleza")').next('td.data').text().trim() ||
         'Mixta';
}

function getDenominacion($) {
  const denom = $('#MainContent_ctrlTM_trDenomination .data').text().trim() ||
         $('#MainContent_ctrlIRD_trTMName .data').text().trim() ||
         $('#MainContent_ctrlIRA_trTMName .data').text().trim() ||
         $('td.label:contains("Denominación del Signo")').next('td.data').text().trim();
  
  return denom.toUpperCase(); // Asegurar que esté en mayúsculas como en el original
}

function getReivindicacionColores($) {
  // Opción más directa y efectiva: extraer solo desde el divColorTxt que contiene la descripción real de colores
  const divColorText = $('#MainContent_ctrlTM_divColorTxt').text().trim();
  if (divColorText && divColorText.length > 0) {
    return divColorText;
  }
  
  // Verificar el estado de los botones de radio directamente
  if ($('#MainContent_ctrlTM_rbtnColor_0').is(':checked')) {
    return "Sí"; // Solo indicar que hay reivindicación sin texto específico
  } else if ($('#MainContent_ctrlTM_rbtnColor_1').is(':checked')) {
    return "No"; // Indicar que no hay reivindicación
  }
  
  // Retorno por defecto si no se puede determinar
  return "";
}

function getImagenUrl($) {
  return $('a.device').attr('href') ||
         $('a.devicePopup').attr('href') ||
         $('img.device').attr('src');
}

function getTransliteracion($) {
  return $('#MainContent_ctrlIRD_trTransliteration .data').text().trim() || 
         $('#MainContent_ctrlTM_trTransliteration .data').text().trim();
}

function getTraduccionEspanol($) {
  return $('#MainContent_ctrlIRD_trSpanishTrans .data').text().trim() || 
         $('#MainContent_ctrlTM_trSpanishTrans .data').text().trim();
}

// Detecta y formatea fechas en formato español a formato ISO YYYY-MM-DD
function formatearFecha(fechaTexto) {
  if (!fechaTexto) return null;
  
  // Limpiar la fecha - eliminar saltos de línea y espacios extras
  fechaTexto = fechaTexto.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Extraer fecha si viene con otro texto
  const soloFecha = extraerSoloFecha(fechaTexto);
  if (soloFecha && soloFecha !== fechaTexto) {
    fechaTexto = soloFecha;
  }
  
  // Mapeo de meses en español
  const meses = {
    'ene': '01', 'enero': '01',
    'feb': '02', 'febrero': '02',
    'mar': '03', 'marzo': '03',
    'abr': '04', 'abril': '04',
    'may': '05', 'mayo': '05',
    'jun': '06', 'junio': '06',
    'jul': '07', 'julio': '07',
    'ago': '08', 'agosto': '08',
    'sep': '09', 'septiembre': '09',
    'oct': '10', 'octubre': '10',
    'nov': '11', 'noviembre': '11',
    'dic': '12', 'diciembre': '12'
  };
  
  // Verificar si ya está en formato ISO YYYY-MM-DD
  if (fechaTexto.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fechaTexto;
  }
  
  // Formato: DD mes. YYYY (ej: 23 jul. 2024)
  const patronMesTexto = /(\d{1,2})\s+([a-zá-ú]{3,10})\.?\s+(\d{4})/i;
  const matchFormato1 = fechaTexto.match(patronMesTexto);
  if (matchFormato1) {
    const dia = matchFormato1[1].padStart(2, '0');
    const mesTexto = matchFormato1[2].toLowerCase().replace(/\.$/, '');
    const mes = meses[mesTexto] || '01';
    const anio = matchFormato1[3];
    
    return `${anio}-${mes}-${dia}`;
  }
  
  // Formato: DD/MM/YYYY
  const patronFechaSlash = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const matchFormato2 = fechaTexto.match(patronFechaSlash);
  if (matchFormato2) {
    const dia = matchFormato2[1].padStart(2, '0');
    const mes = matchFormato2[2].padStart(2, '0');
    const anio = matchFormato2[3];
    
    return `${anio}-${mes}-${dia}`;
  }
  
  // Si llegamos aquí, no se pudo formatear
  return fechaTexto;

}

// Función auxiliar para extraer solo la fecha de un texto que puede contener más información
function extraerSoloFecha(texto) {
  if (!texto) return '';
  
  // Primero limpiamos el texto de saltos de línea y espacios múltiples
  texto = texto.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Buscar patrones de fecha en el texto
  
  // Patrón DD mes YYYY (ej: 23 jul. 2024 o 23 julio 2024)
  const patronMesTexto = /(\d{1,2}\s+[a-zá-ú]{3,10}\.?\s+\d{4})/i;
  const matchMesTexto = texto.match(patronMesTexto);
  if (matchMesTexto) return matchMesTexto[1];
  
  // Patrón DD/MM/YYYY
  const patronFechaSlash = /(\d{1,2}\/\d{1,2}\/\d{4})/;
  const matchFechaSlash = texto.match(patronFechaSlash);
  if (matchFechaSlash) return matchFechaSlash[1];
  
  // Patrón DD-MM-YYYY
  const patronFechaGuion = /(\d{1,2}-\d{1,2}-\d{4})/;
  const matchFechaGuion = texto.match(patronFechaGuion);
  if (matchFechaGuion) return matchFechaGuion[1];
  
  // Si hay un número de solicitud, podemos intentar eliminarlo
  if (texto.includes('SD20')) {
    const limpio = texto.replace(/SD20\d+\/\d+/, '').trim();
    // Intentar de nuevo con el texto limpio
    return extraerSoloFecha(limpio);
  }
  
  return texto;
}

function formateaRefCliente(refCliente) {
  if (!refCliente) return '';
  return `Referencia del solicitante | ${refCliente} | `;
}

module.exports = {
  extractDataWithErrorHandling,
  insertToSimPrecarga
};

// Código para prueba directa
if (require.main === module) {
  // Tomar el ID de expediente de los argumentos de línea de comandos, o usar uno predeterminado
  const expediente = process.argv[2] || '5293788';
  
  console.log(`
  ============================================
  🧪 PRUEBA DEL EXTRACTOR SIC
  ============================================
  Expediente a probar: ${expediente}
  ============================================
  `);
  
  // Función de prueba
  async function testExtractor() {
    try {
      // 1. Extraer datos
      console.log('🔍 Extrayendo datos...');
      const data = await extractDataWithErrorHandling(expediente);
      
      // 2. Mostrar un resumen de los datos extraídos
      console.log(`
      ============================================
      ✅ DATOS EXTRAÍDOS:
      ============================================
      Expediente: ${data.numeroSolicitud || 'N/A'}
      Denominación: ${data.denominacionDelSigno || 'N/A'}
      Tipo: ${data.tipoDeSignoDistintivo || 'N/A'}
      Naturaleza: ${data.naturaleza || 'N/A'}
      Fecha solicitud: ${data.fechaRadicacion || 'N/A'}
      Fecha publicación: ${data.publicacionInfo.fechaPublicacion || 'N/A'}
      Solicitante: ${data.solicitantesInfo[0]?.solicitantes[0]?.fullName || 'N/A'}
      Clases: ${data.multiclases?.versionInfo?.clases || 'N/A'}
      Versión Niza: ${data.multiclases?.versionInfo?.version || 'N/A'}
      Estado: ${data.estado || 'N/A'}
      Media URL: ${data.media?.[0] || 'N/A'}
      Prioridad: ${data.prioridadInfo && data.prioridadInfo.length > 0 
        ? `${data.prioridadInfo[0].pais} (${data.prioridadInfo[0].fechaDePrioridad})` 
        : 'N/A'}
      ============================================
      `);
      
      // 3. Mostrar los productos y servicios
      if (data.multiclases?.clasesInfo?.length > 0) {
        console.log(`
        ============================================
        📋 PRODUCTOS Y SERVICIOS (${data.multiclases.clasesInfo.length}):
        ============================================`);
        
        data.multiclases.clasesInfo.forEach((claseInfo, index) => {
          console.log(`
          #${index + 1} - Clase ${claseInfo.clase}:
          ${claseInfo.descripcion.substring(0, 150)}${claseInfo.descripcion.length > 150 ? '...' : ''}
          `);
        });
      }
      
      // 4. Mostrar información de prioridad si existe
      if (data.prioridadInfo && data.prioridadInfo.length > 0) {
        console.log(`
        ============================================
        🔖 INFORMACIÓN DE PRIORIDAD:
        ============================================`);
        
        data.prioridadInfo.forEach((prioridad, index) => {
          console.log(`
          #${index + 1} - País: ${prioridad.pais}
          Fecha: ${prioridad.fechaDePrioridad}
          Número: ${prioridad.numeroDePrioridad}
          `);
        });
      }
      
      // 4. Guardar los datos en un archivo JSON para revisión
      const fs = require('fs').promises;
      const outputPath = `${expediente}_test_output.json`;
      
      // Comprobación final para asegurar que las fechas de prioridad están formateadas
      if (data.prioridadInfo && data.prioridadInfo.length > 0) {
        data.prioridadInfo.forEach(prioridad => {
          // Intentar formatear directamente si aún no está en formato ISO
          if (prioridad.fechaDePrioridad && !prioridad.fechaDePrioridad.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.log(`Reformateando fecha de prioridad: ${prioridad.fechaDePrioridad}`);
            prioridad.fechaDePrioridad = formatearFecha(prioridad.fechaDePrioridad) || prioridad.fechaDePrioridad;
          }
        });
      }
      
      await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
      console.log(`💾 Datos completos guardados en: ${outputPath}`);
      
      // 5. Opcional: Simular inserción en base de datos
      console.log('🔄 ¿Desea probar la inserción en base de datos? (S/N)');
      process.stdin.once('data', async (input) => {
        const response = input.toString().trim().toLowerCase();
        if (response === 's' || response === 'si' || response === 'y' || response === 'yes') {
          try {
            const config = require('../config/mysql.config');
            console.log('🔄 Insertando en base de datos...');
            const result = await insertToSimPrecarga(data, config);
            console.log(`✅ Resultado de inserción: ${result.success ? 'Éxito' : 'Fallo'}`);
          } catch (dbError) {
            console.error('❌ Error al insertar en base de datos:', dbError);
          }
        }
        
        console.log('🎉 Prueba completada.');
        process.exit(0);
      });
    } catch (error) {
      console.error('❌ Error durante la prueba:', error);
      process.exit(1);
    }
  }
  
  // Ejecutar la prueba
  testExtractor();
}