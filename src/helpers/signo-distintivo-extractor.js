/**
 * Obtiene si se reivindica color distintivo en la marca
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {boolean} - True si se reivindica color, false en caso contrario
 */
function getReivindicaColorDistintivo($) {
  // Lista de selectores para detectar reivindicación de color
  const selectores = [
    // Radio buttons
    '#MainContent_ctrlTM_rbtnColor_0',
    '#MainContent_ctrlIRD_rbtnColor_0',
    '#MainContent_ctrlIRA_rbtnColor_0',
    
    // Checkboxes
    '#MainContent_ctrlTM_cbColorClaimIndicator',
    '#MainContent_ctrlIRD_cbColorClaimIndicator',
    '#MainContent_ctrlIRA_cbColorClaimIndicator',
    
    // Checkboxes para "La marca consiste en un color"
    '#MainContent_ctrlTM_cbColor',
    '#MainContent_ctrlIRD_cbColor',
    '#MainContent_ctrlIRA_cbColor',
    
    // Selectores más genéricos por si cambia la estructura
    'input[id*="ColorClaimIndicator"]',
    'input[id*="cbColor"]',
    'input[id*="rbtnColor_0"]'
  ];
  
  // Verificar cada selector
  for (const selector of selectores) {
    if ($(selector).is(':checked')) {
      return true;
    }
  }
  
  // También verificar si hay contenido en divs de colores
  const colorDivs = [
    '#MainContent_ctrlTM_divColorTxt',
    '#MainContent_ctrlIRD_divColorTxt',
    '#MainContent_ctrlIRA_divColorTxt'
  ];
  
  for (const div of colorDivs) {
    const text = $(div).text().trim();
    if (text && text.length > 0) {
      return true;
    }
  }
  
  // Buscar también por texto en la página
  const textoReivindicacion = $('label:contains("El solicitante reivindica el color como elemento distintivo")').text();
  if (textoReivindicacion) {
    // Verificar si el checkbox correspondiente está marcado
    const checkbox = $('label:contains("El solicitante reivindica el color como elemento distintivo")').prev('input[type="checkbox"]');
    if (checkbox.is(':checked')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Obtiene si la marca se considera en caracteres estándar
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {boolean} - True si es caracteres estándar, false en caso contrario
 */
function getCaracteresEstandar($) {
  // Lista de selectores para detectar caracteres estándar
  const selectores = [
    '#MainContent_ctrlTM_cbDeclaration',
    '#MainContent_ctrlIRD_cbDeclaration',
    '#MainContent_ctrlIRA_cbDeclaration',
    'input[id*="cbDeclaration"]'
  ];
  
  // Verificar cada selector
  for (const selector of selectores) {
    if ($(selector).is(':checked')) {
      return true;
    }
  }
  
  // Buscar también por texto en la página
  const textoCaracteres = $('label:contains("El solicitante declara que desea que la marca se considere como marca en caracteres estándar")').text();
  if (textoCaracteres) {
    // Verificar si el checkbox correspondiente está marcado
    const checkbox = $('label:contains("El solicitante declara que desea que la marca se considere como marca en caracteres estándar")').prev('input[type="checkbox"]');
    if (checkbox.is(':checked')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Obtiene el tipo de signo distintivo (Marca, Lema, Enseña, etc.)
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Tipo de signo distintivo o 'Marca' por defecto
 */
function getTipoSignoDistintivo($) {
  // Buscar por múltiples selectores y patrones
  const selectores = [
    // Selectores específicos
    '#MainContent_ctrlTM_trTMNature .data',
    '#MainContent_ctrlIRD_trTMNature .data',
    '#MainContent_ctrlIRA_trTMNature .data',
    
    // Buscar por etiqueta
    'td.label:contains("Tipo de Signo") + td.data',
    'td.label:contains("Naturaleza del Signo") + td.data',
    'td.label:contains("Tipo de la Marca") + td.data'
  ];
  
  // Verificar cada selector
  for (const selector of selectores) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  // Si no encuentra, buscar en toda la estructura
  let resultado = '';
  
  // Buscar por textos específicos en filas de tabla
  $('tr').each(function() {
    const rowText = $(this).text().toLowerCase();
    if (rowText.includes('tipo de signo') || rowText.includes('naturaleza del signo') || rowText.includes('tipo de la marca')) {
      resultado = $(this).find('td.data').text().trim();
      return false; // Romper el bucle si encontramos algo
    }
  });
  
  return resultado || 'Marca';
}

/**
 * Obtiene la naturaleza del signo distintivo (Denominativa, Mixta, Figurativa, etc.)
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Naturaleza del signo o 'Mixta' por defecto
 */
function getNaturaleza($) {
  // Buscar por múltiples selectores y patrones
  const selectores = [
    // Selectores específicos
    '#MainContent_ctrlTM_trTMType .data',
    '#MainContent_ctrlIRD_trTMType .data',
    '#MainContent_ctrlIRA_trTMType .data',
    
    // Buscar por etiqueta
    'td.label:contains("Naturaleza") + td.data',
    'td.label:contains("Tipo") + td.data'
  ];
  
  // Verificar cada selector
  for (const selector of selectores) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  // Si no encuentra, buscar en toda la estructura
  let resultado = '';
  
  // Buscar por textos específicos en filas de tabla
  $('tr').each(function() {
    const rowText = $(this).text().toLowerCase();
    if (rowText.includes('naturaleza') && !rowText.includes('naturaleza del signo')) {
      resultado = $(this).find('td.data').text().trim();
      return false; // Romper el bucle si encontramos algo
    }
  });
  
  return resultado || 'Mixta';
}

/**
 * Obtiene la denominación del signo
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Denominación del signo o cadena vacía
 */
function getDenominacion($) {
  // Buscar por múltiples selectores y patrones
  const selectores = [
    // Selectores específicos
    '#MainContent_ctrlTM_trDenomination .data',
    '#MainContent_ctrlIRD_trTMName .data',
    '#MainContent_ctrlIRA_trTMName .data',
    
    // Buscar por etiqueta
    'td.label:contains("Denominación del Signo") + td.data',
    'td.label:contains("Nombre de la marca") + td.data'
  ];
  
  // Verificar cada selector
  for (const selector of selectores) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text.toUpperCase();
    }
  }
  
  // Si no encuentra, buscar en toda la estructura
  let resultado = '';
  
  // Buscar por textos específicos en filas de tabla
  $('tr').each(function() {
    const rowText = $(this).text().toLowerCase();
    if (rowText.includes('denominación del signo') || rowText.includes('nombre de la marca')) {
      resultado = $(this).find('td.data').text().trim();
      return false; // Romper el bucle si encontramos algo
    }
  });
  
  if (resultado) {
    return resultado.toUpperCase();
  }
  
  console.warn('No contiene denominación.');
  return '';
}

/**
 * Obtiene la reivindicación de colores
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Descripción de los colores reivindicados o cadena vacía
 */
function getReivindicacionColores($) {
    // Si no se reivindica color, devolver string vacío
    if (!getReivindicaColorDistintivo($)) {
      return "";
    }
    
    // Buscar específicamente en divs que contienen la descripción real de los colores
    const divs = [
      '#MainContent_ctrlTM_divColorTxt',
      '#MainContent_ctrlIRD_divColorTxt',
      '#MainContent_ctrlIRA_divColorTxt'
    ];
    
    // Buscar texto real de colores, excluyendo mensajes del sistema
    for (const div of divs) {
      let text = $(div).text().trim();
      
      // Excluir textos que son parte de la interfaz de usuario o mensajes de validación
      if (text) {
        // Limpiar mensajes de validación y etiquetas estándar
        text = text.replace(/Este campo es obligatorio/g, '')
                   .replace(/Usted no reivindicó colores.*/g, '')
                   .replace(/La marca consiste en.*/g, '')
                   .replace(/El solicitante reivindica.*/g, '')
                   .replace(/SíNo/g, '')
                   .trim();
        
        if (text && text.length > 0) {
          return text;
        }
      }
    }
    
    // Búsqueda alternativa: verificar radio buttons
    if ($('#MainContent_ctrlTM_rbtnColor_0').is(':checked') || $('#MainContent_ctrlIRD_rbtnColor_0').is(':checked')) {
      return "Sí";
    }
    
    if ($('#MainContent_ctrlTM_rbtnColor_1').is(':checked') || $('#MainContent_ctrlIRD_rbtnColor_1').is(':checked')) {
      return "";
    }
    
    // Si hay reivindicación pero no podemos determinar el texto específico
    return "";
  }

  

/**
 * Obtiene información de los medios asociados al expediente
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con identificadores de los medios
 */
function getMediaInfo($) {
  const mediaIds = [];
  const processedIds = new Set(); // Para evitar duplicados
  
  // Buscar todos los enlaces y imágenes relevantes
  const selectors = [
    'a.device', 'a.devicePopup', 'a.devicePdf', 
    '.device a', '#MainContent_ctrlTM_ctrlPictureList_lvDocumentView a', 
    '#MainContent_ctrlIRD_ctrlPictureList_lvDocumentView a',
    '#galeria img', '#MainContent_ctrlDM_rptDocumentos_imgThumb',
    'img[src*="GetVirtualReproduccion"]', 'a[href*="GetVirtualReproduccion"]'
  ];
  
  $(selectors.join(', ')).each(function() {
    // Obtener URL del elemento
    let url = $(this).attr('href') || $(this).attr('src');
    if (!url) return;
    
    // Intentar extraer ID de la URL
    let mediaId;
    
    // Patrón para IDs en URLs
    const idPatterns = [
      /[?&]id=([^&]+)/,
      /[?&]objectId=([^&]+)/,
      /\/([0-9a-f]+)(?:\?|$)/
    ];
    
    for (const pattern of idPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        mediaId = match[1];
        break;
      }
    }
    
    // Si no se pudo extraer un ID, usar la última parte de la URL
    if (!mediaId) {
      const pathParts = url.split('/');
      mediaId = pathParts[pathParts.length - 1].split('?')[0];
    }
    
    // Evitar duplicados y asegurar que tenemos algo válido
    if (mediaId && !processedIds.has(mediaId)) {
      processedIds.add(mediaId);
      mediaIds.push(mediaId);
    }
  });
  
  return mediaIds;
}

/**
 * Obtiene la transliteración si existe
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Transliteración o cadena vacía
 */
function getTransliteracion($) {
  const selectors = [
    '#MainContent_ctrlIRD_trTransliteration .data',
    '#MainContent_ctrlTM_trTransliteration .data',
    '#MainContent_ctrlIRA_trTransliteration .data',
    'td.label:contains("Transliteración") + td.data'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  return '';
}

/**
 * Obtiene la traducción al español si existe
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Traducción o cadena vacía
 */
function getTraduccionEspanol($) {
  const selectors = [
    '#MainContent_ctrlIRD_trSpanishTrans .data',
    '#MainContent_ctrlTM_trSpanishTrans .data',
    '#MainContent_ctrlIRA_trSpanishTrans .data',
    'td.label:contains("Traducción") + td.data',
    'td.label:contains("Traducción al español") + td.data'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  return '';
}

/**
 * Función para extraer elementos verbales del HTML
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Elementos verbales o cadena vacía
 */
function getElementosVerbales($) {
  const selectors = [
    '#MainContent_ctrlIRA_trVerbalElements .data',
    '#MainContent_ctrlTM_trVerbalElements .data',
    '#MainContent_ctrlIRD_trVerbalElements .data',
    'td.label:contains("Elementos verbales") + td.data'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  return '';
}

/**
 * Función para extraer el alcance del derecho del HTML
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Alcance del derecho o cadena vacía
 */
function getAlcanceDerecho($) {
  const selectors = [
    '#MainContent_ctrlIRA_trDisclaimer .data',
    '#MainContent_ctrlTM_trDisclaimer .data',
    '#MainContent_ctrlIRD_trDisclaimer .data',
    'td.label:contains("Alcance del derecho") + td.data'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  return '';
}

/**
 * Función para extraer otros detalles de la solicitud del HTML
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {string} - Otros detalles o cadena vacía
 */
function getOtrosDetalles($) {
  const selectors = [
    '#MainContent_ctrlIRA_trAdditionaldetails .data',
    '#MainContent_ctrlTM_trAdditionaldetails .data',
    '#MainContent_ctrlIRD_trAdditionaldetails .data',
    'td.label:contains("Otros detalles") + td.data'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text && text.length > 0) {
      return text;
    }
  }
  
  return '';
}

/**
 * Obtiene los países designados si existen
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array de códigos de países
 */
function getPaisesDesignados($) {
  const paises = [];
  
  // Buscar en la tabla de países designados
  const tablas = [
    '#MainContent_ctrlIRD_ctrlCountryList_gvCustomers tr.alt1',
    '#MainContent_ctrlTM_ctrlCountryList_gvCustomers tr.alt1',
    '#MainContent_ctrlIRA_ctrlCountryList_gvCustomers tr.alt1'
  ];
  
  for (const selector of tablas) {
    $(selector).each(function() {
      const codigo = $(this).find('td').eq(0).text().trim();
      if (codigo && codigo.length > 0) {
        paises.push(codigo);
      }
    });
    
    if (paises.length > 0) {
      break; // Si ya encontramos países, no seguir buscando
    }
  }
  
  // También buscar por texto descriptivo
  if (paises.length === 0) {
    const paisesText = $('td.label:contains("Países designados") + td.data').text().trim();
    if (paisesText) {
      // Intentar extraer códigos de países (generalmente en formato de 2 letras)
      const codigos = paisesText.split(/[,;\s]+/).filter(code => /^[A-Z]{2}$/.test(code));
      paises.push(...codigos);
    }
  }
  
  return paises;
}

/**
 * Extrae la URL de redirección y el ID de proceso si existen
 * @param {string} html - HTML completo
 * @returns {Object} - Objeto con redirectUrl e idProc
 */
function getRedirectInfo(html) {
  const result = {};
  
  // Buscar la URL de redirección
  const redirectMatch = html.match(/<div id="first-redirect-url">First Redirect URL: <a href="([^"]+)"/);
  if (redirectMatch && redirectMatch[1]) {
    result.redirectUrl = redirectMatch[1];
    
    // Extraer idProc si está disponible
    const idProcMatch = redirectMatch[1].match(/idProc=([0-9]+)/);
    if (idProcMatch && idProcMatch[1]) {
      result.idProc = idProcMatch[1];
    }
  }
  
  return result;
}

module.exports = {
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
  };