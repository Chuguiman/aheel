// src/gaceta-processor.js - Procesador de archivos Excel de Gaceta SIC
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

/**
 * Función para convertir fechas de formato "01 may. 2018" a "2018-05-01"
 */
function convertDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const months = {
    'ene.': '01',
    'feb.': '02',
    'mar.': '03',
    'abr.': '04',
    'may.': '05',
    'jun.': '06',
    'jul.': '07',
    'ago.': '08',
    'sep.': '09',
    'oct.': '10',
    'nov.': '11',
    'dic.': '12'
  };
  
  const parts = dateStr.trim().split(' ');
  if (parts.length < 3) return dateStr; // Si no cumple el patrón esperado, se retorna tal cual
  
  const day = parts[0].padStart(2, '0');
  const monthAbbr = parts[1].toLowerCase();
  const year = parts[2];
  const monthNumber = months[monthAbbr] || '01';
  
  return `${year}-${monthNumber}-${day}`;
}

/**
 * Procesa un archivo Excel de Gaceta SIC
 */
async function processGacetaFile(filePath, connection = null) {
  // Arreglos para detalles de filas
  const processedDetails = [];
  const skippedDetails = [];
  const errorDetails = [];
  
  // Contadores
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  console.log(`\nProcesando archivo de Gaceta SIC: ${filePath}`);
  
  try {
    // Verificar la conexión a la base de datos
    let needToCloseConnection = false;
    if (!connection) {
      // Si no se proporciona una conexión, crear una nueva
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'precarga_sim'
      });
      console.log("Conexión a la base de datos creada.");
      needToCloseConnection = true;
    }
    
    // Verificar existencia del archivo
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo Excel no existe en la ruta especificada: ${filePath}`);
    }
    
    // Leer el archivo Excel con opciones completas para asegurar la lectura de todas las hojas
    console.log("Leyendo el archivo Excel...");
    const workbook = XLSX.readFile(filePath, { 
      cellFormula: true,
      cellNF: true,
      cellStyles: true 
    });
    console.log("Archivo Excel leído correctamente.");
    
    // Mostrar información sobre todas las hojas disponibles
    console.log(`El archivo contiene ${workbook.SheetNames.length} hojas:`);
    workbook.SheetNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    
    // Definir encabezados que se asignarán al convertir a JSON
    const headers = [
      'Expediente No.',
      'Trámite',
      'Fecha de presentación',
      'Naturaleza del Signo',
      'Denominación del Signo',
      'Etiqueta',
      'Clases',
      'Reivindicación de Colores',
      'Prioridad',
      'Estado',
      'Solicitante',
      'Apoderado'
    ];
    
    // Procesar cada hoja del workbook
    for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex++) {
      const sheetName = workbook.SheetNames[sheetIndex];
      console.log(`\n  Procesando hoja ${sheetIndex + 1}/${workbook.SheetNames.length}: "${sheetName}"`);
      
      // Verificar si es la hoja de cancelación
      const isDecisionCancelacion = sheetName.toLowerCase().includes('decisión de cancelación') || 
                                    sheetName.toLowerCase().includes('decision de cancelacion');
      
      // Si es la hoja de cancelación, aplicar lógica especial
      if (isDecisionCancelacion) {
        console.log(`  Detectada hoja de cancelación: "${sheetName}"`);
        console.log(`  Esta hoja requiere un procesamiento especial debido a su estructura diferente.`);
        
        try {
          // Obtener los datos directamente de la hoja sin ajustar rango
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) {
            console.error(`  Error: No se pudo acceder a la hoja "${sheetName}"`);
            continue;
          }
          
          // Para hojas de cancelación, procesamos directamente sin usar encabezados predefinidos
          let data;
          try {
            // Primero intentamos leer toda la hoja para analizar su estructura
            const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
            console.log(`  Estructura de la hoja de cancelación (primeras 5 filas):`);
            for (let i = 0; i < Math.min(5, fullData.length); i++) {
              console.log(`    Fila ${i + 1}: ${JSON.stringify(fullData[i])}`);
            }
            
            // Para hojas de cancelación, buscamos el registro del expediente
            // y lo insertamos con un formato especial
            for (let i = 0; i < fullData.length; i++) {
              const row = fullData[i];
              if (!row || !row.length) continue;
              
              // Buscar valores que parezcan expedientes
              for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                if (!cell) continue;
                
                // Verificar si parece un número de expediente (formato típico: SD2020/123456)
                const expedienteMatch = typeof cell === 'string' && 
                                       (cell.match(/^[A-Z]{2}\d{4}\/\d+$/) || 
                                        cell.match(/^\d{2}-\d+$/) ||
                                        cell.includes('EXPEDIENTE'));
                
                if (expedienteMatch) {
                  const expediente_val = cell;
                  console.log(`    Encontrado posible expediente: ${expediente_val} en fila ${i + 1}, columna ${j + 1}`);
                  
                  // Buscar si hay información adicional en la fila
                  let estado = null;
                  let solicitante = null;
                  
                  // Buscar en esta fila y las siguientes si hay información relevante
                  for (let k = i; k < Math.min(i + 5, fullData.length); k++) {
                    if (!fullData[k]) continue;
                    
                    for (let m = 0; m < fullData[k].length; m++) {
                      const infoCell = fullData[k][m];
                      if (!infoCell || typeof infoCell !== 'string') continue;
                      
                      // Identificar posible estado
                      if (infoCell.includes('CANCEL') || 
                          infoCell.includes('RECHAZ') || 
                          infoCell.includes('CONCES')) {
                        estado = infoCell;
                      }
                      
                      // Identificar posible solicitante (normalmente nombres en mayúsculas)
                      else if (infoCell === infoCell.toUpperCase() && 
                               infoCell.length > 10 && 
                               !infoCell.includes('EXPEDIENTE')) {
                        solicitante = infoCell;
                      }
                    }
                  }
                  
                  // Insertar en la base de datos con información especial
                  try {
                    const insertQuery = `
                      INSERT INTO signos (
                        expediente_no,
                        estado,
                        solicitante,
                        sheet_type,
                        sheet_count
                      )
                      VALUES (?, ?, ?, ?, ?)
                    `;
                    
                    const values = [
                      expediente_val,
                      estado || 'CANCELADO/DECIDIDO',
                      solicitante,
                      sheetName,
                      workbook.SheetNames.length
                    ];
                    
                    await connection.execute(insertQuery, values);
                    console.log(`    Expediente ${expediente_val} insertado correctamente desde la hoja de cancelación.`);
                    
                    // Agregar a los detalles de procesados
                    processedDetails.push({
                      fila: i + 1,
                      numero_caso: expediente_val,
                      id: null,
                      codigo: expediente_val,
                      hoja: sheetName
                    });
                    
                    totalProcessed++;
                  } catch (errInsert) {
                    console.error(`    Error al insertar expediente ${expediente_val}:`, errInsert);
                    
                    // Agregar a los detalles de errores
                    errorDetails.push({
                      fila: i + 1,
                      numero_caso: expediente_val,
                      motivo: `Error: ${errInsert.message}`,
                      hoja: sheetName
                    });
                    
                    totalErrors++;
                  }
                }
              }
            }
          } catch (jsonError) {
            console.error(`  Error al procesar la hoja de cancelación "${sheetName}": ${jsonError.message}`);
            errorDetails.push({
              fila: 0,
              numero_caso: null,
              motivo: `Error al procesar la hoja de cancelación: ${jsonError.message}`,
              hoja: sheetName
            });
            totalErrors++;
          }
        } catch (sheetError) {
          console.error(`  Error procesando la hoja "${sheetName}": ${sheetError.message}`);
          errorDetails.push({
            fila: 0,
            numero_caso: null,
            motivo: `Error procesando la hoja "${sheetName}": ${sheetError.message}`,
            hoja: sheetName
          });
          totalErrors++;
        }
        
        // Continuar con la siguiente hoja después del procesamiento especial
        continue;
      }
      
      // Procesamiento normal para hojas que no son de cancelación
      try {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          console.error(`  Error: No se pudo acceder a la hoja "${sheetName}"`);
          continue;
        }

        // Mostrar información de la hoja
        if (sheet['!ref']) {
          console.log(`  Rango original: ${sheet['!ref']}`);
        } else {
          console.warn(`  Advertencia: La hoja "${sheetName}" no tiene un rango definido (!ref).`);
          continue; // Saltamos esta hoja si no tiene rango
        }
        
        // Ajustar el rango para que inicie en la fila 10, columna B, hasta la columna M
        let fullRange;
        try {
          fullRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        } catch (rangeError) {
          console.error(`  Error al decodificar el rango de la hoja "${sheetName}": ${rangeError.message}`);
          continue; // Saltar esta hoja si hay error al decodificar el rango
        }

        if (fullRange.e.r < 9 || fullRange.e.c < 1) {
          console.warn(`  Advertencia: La hoja "${sheetName}" no tiene suficientes filas o columnas para procesar. Se requiere al menos hasta la fila 10 y columna B.`);
          continue; // Saltamos esta hoja si no tiene suficientes filas/columnas
        }

        fullRange.s.r = 10;    // Fila 10 (0-indexado)
        fullRange.s.c = 1;    // Columna B (0-indexado: A=0, B=1)
        fullRange.e.c = Math.min(fullRange.e.c, 12);   // Columna M (0-indexado: M=12) o la máxima disponible
        
        // Crear una copia de la hoja para no modificar la original
        const processedSheet = {};
        
        // Copiar propiedades importantes
        for (const key in sheet) {
          if (key !== '!ref' && !key.startsWith('!')) {
            processedSheet[key] = sheet[key];
          }
        }
        
        // Asignar nuevo rango
        processedSheet['!ref'] = XLSX.utils.encode_range(fullRange);
        
        // Convertir la hoja a JSON con los encabezados definidos
        let data;
        try {
          data = XLSX.utils.sheet_to_json(processedSheet, { 
            header: headers, 
            defval: null,
            blankrows: false
          });
          console.log(`  Hoja "${sheetName}" convertida a JSON correctamente.`);
        } catch (jsonError) {
          console.error(`  Error al convertir la hoja "${sheetName}" a JSON: ${jsonError.message}`);
          continue; // Saltamos esta hoja si hay error al convertir a JSON
        }
        
        if (!data || data.length === 0) {
          console.log(`  La hoja "${sheetName}" no contiene datos a partir de B10.`);
          continue;
        }
        
        console.log(`  Filas leídas en "${sheetName}": ${data.length}`);
        
        // Obtener la cantidad total de hojas
        const sheetCount = workbook.SheetNames.length;
        const startingRow = 11;  // Indica la fila de Excel donde inician los datos
        
        // Procesar cada fila de data
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNumber = startingRow + i;
          
          // Información para el registro detallado
          let rowInfo = {
            fila: rowNumber,
            numero_caso: null,
            motivo: '',
            hoja: sheetName
          };
          
          // Verificar si la fila está vacía
          if (Object.values(row).every(val => val === null || val === undefined || val === '')) {
            console.log(`    [Fila ${rowNumber}] Fila vacía. Saltando.`);
            rowInfo.motivo = 'Fila vacía';
            skippedDetails.push(rowInfo);
            totalSkipped++;
            continue;
          }
          
          // Variables para almacenar URL, ID extraído y el expediente visible
          let url_expediente = null;
          let id_expediente = null;
          let expediente_val = null;
          
          // Extraer la fórmula de la celda si está en la columna B
          const cellAddress = 'B' + rowNumber; // B10, B11, etc. según i
          const cell = sheet[cellAddress];
          
          // Si la celda tiene fórmula HYPERLINK/HIPERVINCULO
          if (cell && cell.f) {
            // Regex para capturar URL y texto visible (separador coma o punto y coma)
            const regex = /HYPER(?:LINK|VINCULO)\(\s*"([^"]+)"\s*[,;]\s*"([^"]+)"\s*\)/i;
            const matches = cell.f.match(regex);
            
            if (matches && matches.length === 3) {
              // matches[1] -> la URL
              // matches[2] -> el texto visible
              url_expediente = matches[1];    // ej. "http://sipi.sic.gov.co/sipi/View.ashx?4361790"
              expediente_val = matches[2];    // ej. "SD2022/0095027"
              
              // Actualizar el número de caso en el registro detallado
              rowInfo.numero_caso = expediente_val;
              
              // Extraer el número de la URL (después de "View.ashx?")
              const regexNumero = /View\.ashx\?(\d+)/i;
              const matchesNumero = url_expediente.match(regexNumero);
              
              if (matchesNumero) {
                id_expediente = matchesNumero[1].trim(); // ej. "4361790"
              }
            } else {
              // Si la fórmula no coincide con el patrón esperado, usamos el valor de la celda
              console.warn(`    [Fila ${rowNumber}] Fórmula HYPERLINK/HIPERVINCULO no coincide: ${cell.f}`);
              expediente_val = cell.v; 
              rowInfo.numero_caso = expediente_val;
            }
          } else {
            // Si no hay fórmula, usamos el valor evaluado ("Expediente No.")
            expediente_val = row['Expediente No.'];
            rowInfo.numero_caso = expediente_val;
          }
          
          // Convertir fecha al formato YYYY-MM-DD
          let fechaOriginal = row['Fecha de presentación'];
          let fecha_mysql = null;
          
          if (fechaOriginal) {
            // Validar que la fecha sea procesable
            if (typeof fechaOriginal === 'string') {
              // Verificar si parece una fecha válida para nuestro convertidor
              if (fechaOriginal.match(/^\d{1,2}\s+[a-zé.]+\s+\d{4}$/i)) {
                fecha_mysql = convertDate(fechaOriginal);
              } else {
                // Si no coincide con nuestro patrón de fecha, intentar con Date
                try {
                  const testDate = new Date(fechaOriginal);
                  if (!isNaN(testDate.getTime())) {
                    fecha_mysql = testDate.toISOString().split('T')[0];
                  }
                } catch (dateError) {
                  console.log(`    [Fila ${rowNumber}] Valor de fecha no válido: "${fechaOriginal}". Se usará NULL.`);
                }
              }
            } else if (typeof fechaOriginal === 'number') {
              // Intentar interpretar como número de Excel
              try {
                const excelDate = XLSX.SSF.parse_date_code(fechaOriginal);
                if (excelDate) {
                  const date = new Date(excelDate.y, excelDate.m - 1, excelDate.d);
                  fecha_mysql = date.toISOString().split('T')[0];
                }
              } catch (numDateError) {
                console.log(`    [Fila ${rowNumber}] Valor numérico de fecha no válido: ${fechaOriginal}. Se usará NULL.`);
              }
            }
            
            // Si después de todos los intentos no tenemos una fecha válida, usar NULL
            if (fecha_mysql === null) {
              console.log(`    [Fila ${rowNumber}] No se pudo convertir "${fechaOriginal}" a formato de fecha. Se usará NULL.`);
            }
          }
          
          // Determinar el tipo de hoja y la cantidad de hojas
          const sheet_type = sheetName; 
          const sheet_count = sheetCount;
          
          // Preparar la inserción en MySQL
          const insertQuery = `
            INSERT INTO signos (
              url_expediente,
              id_expediente,
              expediente_no,
              tramite,
              fecha_presentacion,
              naturaleza_del_signo,
              denominacion_del_signo,
              etiqueta,
              clases,
              reivindicacion_de_colores,
              prioridad,
              estado,
              solicitante,
              apoderado,
              sheet_type,
              sheet_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const values = [
            url_expediente,
            id_expediente,
            expediente_val,
            row['Trámite'] || null,
            fecha_mysql,
            row['Naturaleza del Signo'] || null,
            row['Denominación del Signo'] || null,
            row['Etiqueta'] || null,
            row['Clases'] || null,
            row['Reivindicación de Colores'] || null,
            row['Prioridad'] || null,
            row['Estado'] || null,
            row['Solicitante'] || null,
            row['Apoderado'] || null,
            sheet_type,
            sheet_count
          ];
          
          try {
            await connection.execute(insertQuery, values);
            console.log(`    [Fila ${rowNumber}] Insertada correctamente.`);
            
            // Agregar a los detalles de procesados
            processedDetails.push({
              fila: rowNumber,
              numero_caso: rowInfo.numero_caso,
              id: id_expediente,
              codigo: expediente_val,
              hoja: sheetName
            });
            
            totalProcessed++;
          } catch (errInsert) {
            console.error(`    [Fila ${rowNumber}] Error INSERT:`, errInsert);
            
            // Agregar a los detalles de errores
            rowInfo.motivo = `Error: ${errInsert.message}`;
            errorDetails.push(rowInfo);
            
            totalErrors++;
          }
        } // Fin for data
      } catch (sheetError) {
        console.error(`  Error procesando la hoja "${sheetName}": ${sheetError.message}`);
        errorDetails.push({
          fila: 0,
          numero_caso: null,
          motivo: `Error procesando la hoja "${sheetName}": ${sheetError.message}`,
          hoja: sheetName
        });
        totalErrors++;
      }
    } // Fin for workbook.SheetNames
    
    console.log(`\nProcesamiento completado para el archivo.`);
    console.log(`Total procesadas: ${totalProcessed}, saltadas: ${totalSkipped}, errores: ${totalErrors}`);
    
    // Cerrar la conexión si la creamos aquí
    if (needToCloseConnection && connection) {
      await connection.end();
      console.log("Conexión a la base de datos cerrada.");
    }
    
    // Retornar resultados
    return {
      message: `Proceso completado. Filas procesadas: ${totalProcessed}, Filas saltadas: ${totalSkipped}, Filas con errores: ${totalErrors}`,
      details: {
        procesadas: processedDetails,
        saltadas: skippedDetails,
        errores: errorDetails
      },
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors
    };
    
  } catch (error) {
    console.error('Error al procesar el archivo de Gaceta SIC:', error);
    
    // Cerrar la conexión en caso de error si la creamos aquí
    if (connection && connection.end) {
      try {
        await connection.end();
        console.log("Conexión a la base de datos cerrada después de error.");
      } catch (closeError) {
        console.error("Error al cerrar la conexión:", closeError);
      }
    }
    
    throw error;
  }
}

/**
 * Procesa una carpeta con archivos Excel de Gaceta SIC
 */
async function processGacetaFolder(folderPath) {
  // Creamos una única conexión para todos los archivos
  let connection;
  
  try {
    // Crear conexión
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'precarga_sim'
    });
    
    console.log(`\nProcesando carpeta de Gacetas SIC: ${folderPath}`);
    
    // Leer el directorio y filtrar archivos .xlsx o .xls
    let files;
    try {
      files = fs.readdirSync(folderPath).filter(file =>
        file.endsWith('.xlsx') || file.endsWith('.xls')
      );
    } catch (err) {
      console.error('Error al leer el directorio:', err);
      throw err;
    }
    
    if (files.length === 0) {
      console.log('No se encontraron archivos Excel (.xlsx o .xls) en la carpeta.');
      await connection.end();
      
      return {
        message: "No se encontraron archivos Excel para procesar.",
        details: { procesadas: [], saltadas: [], errores: [] },
        processed: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    console.log(`Encontrados ${files.length} archivos Excel.`);
    
    // Variables para acumular resultados
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const allProcessedDetails = [];
    const allSkippedDetails = [];
    const allErrorDetails = [];
    
    // Procesar cada archivo
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      
      try {
        const result = await processGacetaFile(filePath, connection);
        
        // Acumular resultados
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        // Acumular detalles
        allProcessedDetails.push(...result.details.procesadas);
        allSkippedDetails.push(...result.details.saltadas);
        allErrorDetails.push(...result.details.errores);
        
      } catch (err) {
        console.error(`Error procesando archivo ${file}:`, err);
        totalErrors++;
        
        // Agregar a los detalles de errores
        allErrorDetails.push({
          fila: 0,
          numero_caso: null,
          motivo: `Error en archivo ${file}: ${err.message}`,
          hoja: "N/A"
        });
      }
    }
    
    // Cerrar la conexión
    await connection.end();
    
    // Retornar resultados acumulados
    return {
      message: `Proceso completado. Filas procesadas: ${totalProcessed}, Filas saltadas: ${totalSkipped}, Filas con errores: ${totalErrors}`,
      details: {
        procesadas: allProcessedDetails,
        saltadas: allSkippedDetails,
        errores: allErrorDetails
      },
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors
    };
    
  } catch (error) {
    console.error('Error general al procesar carpeta:', error);
    
    // Cerrar la conexión en caso de error
    if (connection && connection.end) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error("Error al cerrar la conexión:", closeError);
      }
    }
    
    throw error;
  }
}

// Si se ejecuta directamente (node gaceta-processor.js)
if (require.main === module) {
  (async () => {
    try {
      const directoryPath = process.argv[2] || path.join(__dirname, '..', 'src', 'uploads');
      const result = await processGacetaFolder(directoryPath);
      console.log('Resultado:', result.message);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  })();
}

// Exportar funciones para usar desde otros módulos
module.exports = {
  processGacetaFile,
  processGacetaFolder,
  convertDate
};