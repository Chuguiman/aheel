// src/services/extractor-sic.js
/**
 * Extractor mejorado para datos de expedientes SIC
 */
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const config = require('../config/mysql.config');

const { extraerRepresentantes } = require('../helpers/representantes-extractor');
const {
  getReivindicaColorDistintivo,
  getCaracteresEstandar,
  getTipoSignoDistintivo,
  getNaturaleza,
  getDenominacion,
  getReivindicacionColores,
  getMediaInfo,
  getTransliteracion,
  getTraduccionEspanol,
  getElementosVerbales,
  getAlcanceDerecho,
  getOtrosDetalles,
  getPaisesDesignados,
  getRedirectInfo
} = require('../helpers/signo-distintivo-extractor');

/**
 * Función principal para extraer datos del HTML
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
    
    // Obtener el número de solicitud del HTML
    let numeroSolicitud = getNumeroSolicitud($);

    // Verificar explícitamente si el expediente es igual al número de solicitud
    let idsicValue = '';
    if (expediente !== numeroSolicitud && numeroSolicitud) {
      idsicValue = expediente;
    }
    
    // Si no se pudo extraer numeroSolicitud, usar expediente como respaldo
    if (!numeroSolicitud) {
      numeroSolicitud = expediente;
      // En este caso, idsic debe estar vacío porque son iguales
      idsicValue = ''; 
    }
    
    // Extraer información de representantes usando el nuevo método
    const representantesData = extraerRepresentantes($);
    
    // Extraer información de redirección y idProc
    const redirectInfo = getRedirectInfo(html);
            
    // Crear la estructura del JSON
    const data = {
      numeroSolicitud: numeroSolicitud,
      idsic: idsicValue,
      refClient: getRefCliente($) || '',
      estado: getEstado($) || '',
      fechaRadicacion: formatearFecha(getFechaSolicitud($)) || getFechaSolicitud($) || '',
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
      
      // Usar la nueva información de representantes
      solicitantesInfo: [representantesData],
      
      prioridadInfo: getPrioridadInfo($), // Usar la info de prioridad con fechas ya formateadas
      
      multiclases: {
        clasesInfo: getClasesInfo($) || [],
        versionInfo: {
          version: getVersionNiza($) || '',
          clases: getClasesString($) || ''
        }
      },
      
      // Datos del signo distintivo usando las funciones mejoradas
      reivindicaColorDistintivo: getReivindicaColorDistintivo($) || false,
      caracteresEstandar: getCaracteresEstandar($) || false,
      tipoDeSignoDistintivo: getTipoSignoDistintivo($) || '',
      naturaleza: getNaturaleza($) || '',
      denominacionDelSigno: getDenominacion($) || '',
      reivindicacionDeColores: getReivindicacionColores($) || '',
      media: getMediaInfo($),
      
      // Campos para traducción
      transliteracion: getTransliteracion($) || '',
      traduccionEspanol: getTraduccionEspanol($) || '',
      
      // Campos adicionales
      elementosVerbales: getElementosVerbales($) || '',
      alcanceDerecho: getAlcanceDerecho($) || '',
      otrosDetalles: getOtrosDetalles($) || '',
      paisesDesignados: getPaisesDesignados($) || []
    };
    
    // Agregar redirección e idProc si existen
    if (redirectInfo.redirectUrl) {
      data.redirectUrl = redirectInfo.redirectUrl;
    }
    
    if (redirectInfo.idProc) {
      data.idProc = redirectInfo.idProc;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error al extraer datos para ${expediente}:`, error);
    throw error;
  }
}



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

/**
 * Obtiene el certificado de registro con soporte mejorado para diferentes estructuras HTML
 */
function getCertificado($) {
  let certificado = '';
  
  // Búsqueda mejorada para el certificado
  // 1. Estructura original
  certificado = $('#MainContent_ctrlTM_trDtRegistration .data').first().text().trim();
  if (certificado) return certificado;
  
  // 2. Estructura alternativa
  certificado = $('#MainContent_ctrlIRD_txtIdRegistration').text().trim();
  if (certificado) return certificado;
  
  // 3. Estructura específica adicional
  certificado = $('#MainContent_ctrlIRD_trDtRegisration .data').first().text().trim();
  if (certificado) return certificado;
  
  // 4. Buscar en cualquier tabla con la etiqueta correcta
  $('tr').each((i, elem) => {
    const labelText = $(elem).find('.label').first().text().trim();
    if (labelText.includes('Certificado de Registro')) {
      certificado = $(elem).find('.data').first().text().trim();
      return false; // Salir del each
    }
  });
  
  return certificado;
}

/**
 * Obtiene la fecha de registro con soporte mejorado
 */
function getFechaRegistro($) {
  let fechaRegistro = '';
  
  // 1. Estructura tradicional
  fechaRegistro = $('#MainContent_ctrlTM_trDtRegistration .data').last().text().trim();
  if (fechaRegistro) return fechaRegistro;
  
  // 2. Estructura alternativa con label
  fechaRegistro = $('#MainContent_ctrlIRD_lblDtRegistration').parent().next('.data').text().trim();
  if (fechaRegistro) return fechaRegistro;
  
  // 3. Estructura específica con ID
  fechaRegistro = $('#MainContent_ctrlIRD_trDtRegisration .data').last().text().trim();
  if (fechaRegistro) return fechaRegistro;
  
  // 4. Buscar en cualquier tabla con la etiqueta correcta
  $('tr').each((i, elem) => {
    const labelText = $(elem).find('.label').text().trim();
    if (labelText.includes('Registrado / Protegido')) {
      fechaRegistro = $(elem).find('.data').last().text().trim();
      return false; // Salir del each
    }
  });
  
  return fechaRegistro;
}

/**
 * Obtiene la fecha de renovación con soporte mejorado
 */
function getFechaRenovacion($) {
  let fechaRenovacion = '';
  
  // 1. Estructura tradicional
  fechaRenovacion = $('#MainContent_ctrlIRD_lblDtRenewal').parent().next('.data').text().trim();
  if (fechaRenovacion) return fechaRenovacion;
  
  // 2. Buscar en cualquier tabla con la etiqueta correcta
  $('tr').each((i, elem) => {
    const labelText = $(elem).find('.label').text().trim();
    if (labelText.includes('Siguiente Fecha de renovación')) {
      fechaRenovacion = $(elem).find('.data').last().text().trim();
      return false; // Salir del each
    }
  });
  
  return fechaRenovacion;
}

/**
 * Obtiene la vigencia con soporte mejorado
 */
function getVigencia($) {
  let vigencia = '';
  
  // 1. Estructura tradicional
  vigencia = $('#MainContent_ctrlTM_trDtExpiration .data').last().text().trim();
  if (vigencia) return vigencia;
  
  // 2. Estructura alternativa con label
  vigencia = $('#MainContent_ctrlIRD_lblDtExpiration').parent().next('.data').text().trim();
  if (vigencia) return vigencia;
  
  // 3. Buscar en cualquier tabla con la etiqueta correcta
  $('tr').each((i, elem) => {
    const labelText = $(elem).find('.label').text().trim();
    if (labelText.includes('Vigente hasta')) {
      vigencia = $(elem).find('.data').last().text().trim();
      return false; // Salir del each
    }
  });
  
  return vigencia;
}


function getNumeroRegistroInternacional($) {
  return $('#MainContent_ctrlIRD_txtIntIdRegistration').text().trim();
}

function getFechaRegistroInternacional($) {
  return $('#MainContent_ctrlIRD_lblDtRegistrationWIPO').parent().next('.data').text().trim();
}


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
        
        //console.log(`DEBUG - Encontrada prioridad alternativa: ${pais}, ${fechaDePrioridadOriginal}, ${numeroDePrioridad}, ${clase}`);
        
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
  //console.log(`DEBUG - Total de prioridades encontradas: ${prioridades.length}`);
  
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


/**
 * Detecta y formatea fechas en formato español a formato ISO YYYY-MM-DD
 */

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
  extractDataWithErrorHandling
};
