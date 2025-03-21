/**
 * Función principal para extraer todos los tipos de representantes del HTML
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Object} - Objeto con todos los tipos de representantes organizados
 */
function extraerRepresentantes($) {
  // Objeto para almacenar todos los tipos de representantes
  const resultado = {};
  
  // Detectar y procesar todos los bloques de representantes
  detectarYProcesarBloques($, resultado);
  
  // Aplicar lógica de respaldo: usar apoderado como contacto si no hay contacto
  let contactosValidos = false;

  if (resultado.contactos && resultado.contactos.length > 0) {
    // Verificar si los contactos existentes tienen datos válidos
    contactosValidos = resultado.contactos.some(contacto => 
      (contacto.nombre && contacto.nombre.trim() !== '') || 
      (contacto.direccion && contacto.direccion.trim() !== '')
    );
  }
  
  // Si no hay contactos válidos pero hay apoderados, usar los apoderados como respaldo
  if (!contactosValidos && resultado.apoderados && resultado.apoderados.length > 0) {
    resultado.contactos = resultado.apoderados.map(apoderado => {
      return {
        numeroIdentificacion: apoderado.numeroIdentificacion || '',
        nombre: apoderado.fullName || '',
        direccion: apoderado.direccion || '',
        ciudad: '',
        codigoPostal: '',
        pais: apoderado.codPais || 'CO',
        tipoDireccion: 'Dirección Física',
        derivadoDeApoderado: true
      };
    });
  }
  
  return resultado;
}

/**
 * Detecta y procesa todos los bloques de representantes en el HTML
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @param {Object} resultado - Objeto donde se almacenarán los resultados
 */
function detectarYProcesarBloques($, resultado) {
  // Buscar todos los posibles contenedores principales
  const contenedoresPrincipales = [
    '#MainContent_ctrlIRD_tblCustomer',
    '#MainContent_ctrlTM_tblCustomer',
    '#MainContent_ctrlIRA_tblCustomer'
  ];
  
  // Para cada contenedor principal
  for (const contenedor of contenedoresPrincipales) {
    if ($(contenedor).length === 0) continue;
    
    // Buscar todos los rows de datos dentro del contenedor
    $(contenedor).find('tr[id*="ctrlApplicant"]').each(function() {
      // Obtener la etiqueta y el tipo de representante
      const labelText = $(this).find('td.label span').text().trim();
      const tipo = normalizarTipoRepresentante(labelText);
      
      if (!tipo) return; // Si no se puede determinar el tipo, ignorar
      
      // Procesar según el tipo de representante
      let datos = [];
      
      // Detectar qué tipo de tabla contiene
      if ($(this).find('table[id*="gvCustomers"]').length > 0) {
        datos = procesarTablaGeneral($(this), $);
      } else if ($(this).find('table[id*="gvAddresses"]').length > 0) {
        datos = procesarTablaContactos($(this), $);
      }
      
      // Guardar los datos en el resultado
      if (datos.length > 0) {
        resultado[tipo] = datos;
      }
    });
  }
  
  // Procesar específicamente Representantes Internacionales si existen
  const representantesInt = getRepresentanteInternacionalInfo($);
  if (representantesInt && representantesInt.representantes && representantesInt.representantes.length > 0) {
    resultado['representantesInternacionales'] = representantesInt.representantes;
  }
}

/**
 * Normaliza el tipo de representante basado en el texto de la etiqueta
 * @param {string} labelText - Texto de la etiqueta
 * @returns {string} - Tipo de representante normalizado
 */
function normalizarTipoRepresentante(labelText) {
  labelText = labelText.toLowerCase();
  
  if (labelText.includes('solicitante')) return 'solicitantes';
  if (labelText.includes('titular')) return 'titulares';
  if (labelText.includes('apoderado')) return 'apoderados';
  if (labelText.includes('contacto')) return 'contactos';
  if (labelText.includes('agente')) return 'agentes';
  if (labelText.includes('representante')) return 'representantes';
  
  return null; // No se pudo determinar el tipo
}

/**
 * Procesa una tabla general de representantes (solicitantes, titulares, apoderados, etc.)
 * @param {Object} trElement - Elemento TR que contiene la tabla
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con los datos procesados
 */
function procesarTablaGeneral(trElement, $) {
  const datos = [];
  
  // Obtener la tabla dentro del TR
  const tabla = trElement.find('table[id*="gvCustomers"]');
  
  // Determinar los índices de columnas según los encabezados
  const columnas = mapearColumnas(tabla, $);
  
  // Procesar cada fila de datos (ignorando encabezados y filas de paginación)
  tabla.find('tr.alt1').each(function() {
    const representante = {};
    
    // Número de identificación
    if (columnas.numeroIdentificacion !== undefined) {
      representante.numeroIdentificacion = $(this).find('td').eq(columnas.numeroIdentificacion).text().trim();
    }
    
    // Identificación OMPI
    if (columnas.identificacionOMPI !== undefined) {
      representante.identificacionOMPI = $(this).find('td').eq(columnas.identificacionOMPI).text().trim();
    }
    
    // Nombre y apellido
    let nombre = '';
    let apellido = '';
    
    if (columnas.nombre !== undefined) {
      nombre = $(this).find('td').eq(columnas.nombre).text().trim();
    }
    
    if (columnas.apellido !== undefined) {
      apellido = $(this).find('td').eq(columnas.apellido).text().trim();
    }
    
    // Normalizar el nombre completo
    representante.fullName = normalizeText(apellido ? `${nombre} ${apellido}` : nombre);
    
    // Dirección
    if (columnas.direccion !== undefined) {
      let direccion = $(this).find('td').eq(columnas.direccion).text().trim();
      direccion = direccion.replace('Dirección Física : ', '');
      representante.direccion = direccion;
      
      // Extraer código de país de la dirección
      const match = direccion.match(/\(([^)]+)\)$/);
      if (match) {
        representante.codPais = match[1];
      } else {
        representante.codPais = 'CO'; // Valor por defecto
      }
    }
    
    // Validar que tenemos datos significativos
    if (representante.numeroIdentificacion || representante.identificacionOMPI || representante.fullName) {
      datos.push(representante);
    }
  });
  
  return datos;
}

/**
 * Procesa una tabla de contactos
 * @param {Object} trElement - Elemento TR que contiene la tabla
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Array} - Array con los datos procesados
 */
function procesarTablaContactos(trElement, $) {
  const datos = [];
  
  // Obtener la tabla dentro del TR
  const tabla = trElement.find('table[id*="gvAddresses"]');
  
  // Procesar cada fila de datos (ignorando encabezados)
  tabla.find('tr').each(function(i) {
    if (i > 0 && !$(this).hasClass('gridview_header') && !$(this).hasClass('gridview_pager')) {
      const contacto = {};
      
      const tds = $(this).find('td');
      if (tds.length >= 6) { // Verificar que tenga suficientes columnas
        contacto.numeroIdentificacion = tds.eq(0).text().trim();
        contacto.nombre = normalizeText(tds.eq(1).text().trim());
        contacto.direccion = tds.eq(2).text().trim();
        contacto.ciudad = tds.eq(3).text().trim();
        contacto.codigoPostal = tds.eq(4).text().trim();
        contacto.pais = tds.eq(5).text().trim();
        
        if (tds.length >= 7) {
          contacto.tipoDireccion = tds.eq(6).text().trim();
        }
        
        // Validar que tenemos datos significativos
        if (contacto.numeroIdentificacion || contacto.nombre) {
          datos.push(contacto);
        }
      }
    }
  });
  
  return datos;
}

/**
 * Mapea los índices de columnas según los encabezados de la tabla
 * @param {Object} tabla - Tabla HTML a procesar
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Object} - Objeto con los índices de cada columna
 */
function mapearColumnas(tabla, $) {
  const columnas = {};
  
  // Buscar los encabezados de la tabla
  tabla.find('tr.alt2 th').each(function(index) {
    const texto = $(this).text().toLowerCase();
    
    if (texto.includes('número de identificación')) {
      columnas.numeroIdentificacion = index;
    } else if (texto.includes('identificación ompi')) {
      columnas.identificacionOMPI = index;
    } else if (texto.includes('nombre(s)')) {
      columnas.nombre = index;
    } else if (texto.includes('apellido(s)')) {
      columnas.apellido = index;
    } else if (texto.includes('dirección')) {
      columnas.direccion = index;
    }
  });
  
  return columnas;
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
 * Función que mantiene compatibilidad con el código existente para representantes internacionales
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Object} - Objeto con datos formateados
 */
function getRepresentanteInternacionalInfo($) {
  const representantes = [];
  let nombresConcatenados = '';
  
  // Seleccionar todas las filas de representantes
  $('#MainContent_ctrlIRD_ctrlApplicant_ctrlWIPORepresentative_gvCustomers tr.alt1').each(function() {
    const representante = {};
    
    representante.identificacionOMPI = $(this).find('td').eq(1).text().trim();
    const nombre = $(this).find('td').eq(2).text().trim();
    const apellido = $(this).find('td').eq(3).text().trim();
    
    // Normalizar el nombre completo: eliminar espacios innecesarios y convertir a mayúsculas
    representante.fullName = normalizeText(apellido ? `${nombre} ${apellido}` : nombre);
    
    // Añadir al array de representantes
    representantes.push(representante);
    
    // Añadir a la concatenación de nombres
    if (representante.fullName) {
      if (nombresConcatenados) {
        nombresConcatenados += ' | ';
      }
      nombresConcatenados += representante.fullName;
    }
  });
  
  // Devolver un objeto con ambos: el array de representantes y los datos formateados para la BD
  return {
    representantes: representantes,
    nombresConcatenados: nombresConcatenados
  };
}

/**
 * Integra la extracción de representantes con la función principal
 * @param {Object} $ - Objeto cheerio con el HTML cargado
 * @returns {Object} - Objeto con todos los datos formateados para la BD
 */
function extraerTodosLosDatos($) {
  // Obtener todos los tipos de representantes
  const representantesData = extraerRepresentantes($);
  
  // Crear estructura esperada por la función principal
  return {
    solicitantesInfo: [representantesData]
  };
}

// Exportar las funciones para su uso
module.exports = {
  extraerRepresentantes,
  extraerTodosLosDatos
};