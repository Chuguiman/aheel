// importar.js - Versión que salta la primera fila del JSON (que son las cabeceras)
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');

// Configuración de Express
const app = express();
const port = 3000;

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Configurar multer sin restricciones de tipo
const upload = multer({ storage: storage });

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Vista principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sol_index.html'));
});

// Ruta para procesar el archivo
app.post('/process', upload.single('excelFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se ha subido ningún archivo' });
  }

  try {
    // Llamar al procesador con la ruta del archivo subido
    const result = await processExcelFile(req.file.path);
    return res.json({ success: true, message: result.message, details: result.details });
  } catch (error) {
    console.error('Error al procesar el archivo:', error);
    return res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
});

// Función de procesamiento - Ahora salta la primera fila del JSON
async function processExcelFile(excelPath) {
    let connection;

    try {
        // Configuración de la base de datos
        const dbConfig = {
            user: 'root',
            password: '',
            database: 'precarga_sim',
            host: 'localhost',
            namedPlaceholders: true
        };

        // Crear conexión a MySQL
        connection = await mysql.createConnection(dbConfig);
        console.log("Conexión exitosa a la base de datos.");

        // Verificar existencia del archivo
        console.log(`Ruta archivo: ${excelPath}`);
        if (!fs.existsSync(excelPath)) {
            throw new Error(`El archivo Excel no existe en la ruta especificada: ${excelPath}`);
        }

        // Leer el archivo Excel
        console.log("Intentando leer el archivo Excel...");
        const workbook = xlsx.readFile(excelPath);
        console.log("Archivo Excel leído correctamente.");

        // Acceder a la primera hoja
        const sheetName = workbook.SheetNames[0]; // Seleccionar la primera hoja
        console.log(`Accediendo a la hoja: ${sheetName}`);
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            throw new Error(`No se pudo acceder a la hoja: ${sheetName}`);
        }
        console.log(`Acceso a la hoja ${sheetName} exitoso.`);

        // Imprimir el rango de la hoja
        console.log(`Rango de la hoja: ${sheet['!ref']}`);

        // Convertir la hoja a JSON sin especificar header ni range para que sea dinámico
        let jsonData;
        try {
            console.log("Intentando convertir la hoja a JSON...");
            jsonData = xlsx.utils.sheet_to_json(sheet, { defval: null });
            console.log("Hoja convertida a JSON exitosamente.");
        } catch (conversionError) {
            console.error("Error durante la conversión a JSON:", conversionError);
            throw conversionError;
        }

        // Mostrar el número de filas y una muestra de los datos
        console.log(`Total de filas leídas: ${jsonData.length}`);
        console.log("Primeras 5 filas de datos:", jsonData.slice(0, 5));

        if (jsonData.length < 1) {
            throw new Error("El archivo Excel no tiene filas de datos.");
        }

        const headers = Object.keys(jsonData[0]); // Obtener las cabeceras desde la primera fila
        console.log("Cabeceras encontradas en el Excel:", headers);

        // Mapeo de encabezados a columnas de la base de datos
        const columnMapping = {
            'Número de caso': { id: 'numero_de_caso_id', codigo: 'numero_de_caso_codigo' },
            'Caso Título': 'caso_titulo',
            'Imagen': 'imagen',
            'Fecha de radicación': 'fecha_de_radicacion',
            'Vigencia': 'vigencia',
            'Estado del Caso': 'estado_del_caso',
            'Referencia del solicitante': 'referencia_del_solicitante',
            'Titular': 'titular',
            'Descripción de Productos y Servicios': 'descripcion_de_productos_y_servicios',
            'Calendario Clasificación de Niza': 'calendario_clasificacion_de_niza',
            'Productos y Servicios Descripción': 'productos_y_servicios_descripcion',
            'Bajo Oposición': 'bajo_oposicion',
            'Apoderado': 'apoderado',
            'Fecha de Registro': 'fecha_de_registro',
            'Fecha de la publicación': 'fecha_de_la_publicacion',
            'Fecha de prioridad': 'fecha_de_prioridad',
            'Otra Información': 'otra_informacion'
        };

        // Comprueba si hay cabeceras coincidentes
        const availableHeaders = headers.filter(header => columnMapping.hasOwnProperty(header));
        
        // Si no hay suficientes cabeceras para procesar, mostrar un error descriptivo
        if (availableHeaders.length === 0) {
            console.error("Cabeceras encontradas en el archivo:", headers);
            console.error("Cabeceras esperadas:", Object.keys(columnMapping));
            throw new Error("No se encontraron cabeceras coincidentes en el archivo Excel. Las cabeceras deberían incluir al menos uno de estos campos: " + Object.keys(columnMapping).join(", "));
        }

        // Preparar las columnas y placeholders dinámicamente para la tabla `casos`
        const insertCasosColumns = [];
        const insertCasosPlaceholders = [];

        for (const header of availableHeaders) {
            const dbColumn = columnMapping[header];
            if (typeof dbColumn === 'object') {
                insertCasosColumns.push(...Object.values(dbColumn));
                insertCasosPlaceholders.push(...Object.values(dbColumn).map(col => `:${col}`));
            } else {
                insertCasosColumns.push(dbColumn);
                insertCasosPlaceholders.push(`:${dbColumn}`);
            }
        }

        const insertCasosQuery = `INSERT INTO casos (${insertCasosColumns.map(col => `\`${col}\``).join(', ')}) VALUES (${insertCasosPlaceholders.join(', ')})`;

        // Preparar la consulta SQL para `scraping_sic`
        const insertScrapingGacQuery = `INSERT INTO scraping_sic (idsic, nreg) VALUES (:idsic, :nreg)`;

        // Arreglos para registrar información detallada de filas procesadas, saltadas y con errores
        let processedRows = 0;
        let skippedRows = 0;
        let errorRows = 0;
        
        // Arrays para almacenar detalles de las filas
        const skippedDetails = [];
        const errorDetails = [];
        const processedDetails = [];

        // Procesar cada fila de datos
        for (const [index, row] of jsonData.entries()) {
            const rowNumber = index + 1; // Número de fila (1-based)
            let rowInfo = {
                fila: rowNumber,
                numero_caso: null,
                motivo: ''
            };

            // IMPORTANTE: Saltar la primera fila, que contiene las cabeceras
            if (index === 0) {
                console.log(`Fila ${rowNumber} es la cabecera. Saltando.`);
                rowInfo.motivo = 'Fila de cabecera';
                skippedDetails.push(rowInfo);
                skippedRows++;
                continue;
            }

            // Saltar filas completamente vacías
            if (availableHeaders.every(header => row[header] === null || row[header] === undefined || row[header] === '')) {
                console.log(`Fila ${rowNumber} está vacía. Saltando.`);
                rowInfo.motivo = 'Fila vacía';
                skippedDetails.push(rowInfo);
                skippedRows++;
                continue;
            }

            const rowDataCasos = {};

            // Intentar obtener el número de caso para el registro detallado
            if (row['Número de caso']) {
                if (typeof row['Número de caso'] === 'string') {
                    rowInfo.numero_caso = row['Número de caso'];
                } else if (row['Número de caso'] && row['Número de caso'].v) {
                    rowInfo.numero_caso = row['Número de caso'].v;
                }
            }

            for (const header of availableHeaders) {
                const dbColumn = columnMapping[header];
                const cellValue = row[header] || null;

                if (typeof dbColumn === 'object') {
                    // Manejar la columna Número de caso
                    const dbId = dbColumn['id'];
                    const dbCodigo = dbColumn['codigo'];

                    // Obtener la dirección de la celda
                    const columnIndex = headers.indexOf(header);
                    const cellAddress = xlsx.utils.encode_cell({ c: columnIndex, r: index });
                    const cell = sheet[cellAddress];

                    let numero = null;
                    let codigo = null;

                    if (cell) {
                        console.log(`Fila ${rowNumber}, Celda ${cellAddress}:`);
                        console.log(`cell.f: ${cell.f || 'N/A'}`);
                        console.log(`cell.l.Target: ${cell.l ? cell.l.Target : 'N/A'}`);

                        // Verificar si la celda tiene una fórmula HYPERLINK
                        if (cell.f && cell.f.toUpperCase().startsWith('HYPERLINK')) {
                            const regex = /HYPERLINK\("([^"]+)"[;,]\s*"([^"]+)"\)/i;
                            const matches = cell.f.match(regex);
                            if (matches && matches.length === 3) {
                                const url = matches[1];
                                const displayText = matches[2];
                                // Extraer el número de la URL usando regex
                                const regexNumero = /View\.ashx\?(\d+)/;
                                const matchesNumero = url.match(regexNumero);
                                numero = matchesNumero ? matchesNumero[1] : null;
                                codigo = displayText;
                                
                                // Actualizar el número de caso en el registro detallado
                                rowInfo.numero_caso = displayText;
                            } else {
                                // Manejar caso donde la fórmula no coincide con el patrón esperado
                                numero = null;
                                codigo = cell.v;
                                console.warn(`Fila ${rowNumber}: La fórmula HYPERLINK no coincide con el patrón esperado.`);
                            }
                        }
                        // Verificar si hay un hipervínculo sin fórmula
                        else if (cell.l && cell.l.Target) {
                            const url = cell.l.Target;
                            const displayText = cell.v;
                            // Extraer el número de la URL usando regex
                            const regexNumero = /View\.ashx\?(\d+)/;
                            const matchesNumero = url.match(regexNumero);
                            numero = matchesNumero ? matchesNumero[1] : null;
                            codigo = displayText;
                            
                            // Actualizar el número de caso en el registro detallado
                            rowInfo.numero_caso = displayText;
                        }
                        // Manejar texto simple sin hipervínculo
                        else {
                            numero = null;
                            codigo = cell.v;
                            console.warn(`Fila ${rowNumber}: No se encontró fórmula HYPERLINK ni hipervínculo en la celda.`);
                            
                            // Actualizar el número de caso en el registro detallado
                            if (cell.v) rowInfo.numero_caso = cell.v;
                        }
                    } else {
                        // Si cell no existe, usar el valor directamente
                        codigo = cellValue;
                        if (cellValue) rowInfo.numero_caso = cellValue;
                    }

                    rowDataCasos[dbId] = numero;
                    rowDataCasos[dbCodigo] = codigo;

                    // Log detallado del mapeo
                    console.log(`Fila ${rowNumber}: numero_de_caso_id = ${numero}, numero_de_caso_codigo = ${codigo}`);
                } else {
                    // Manejar otras columnas
                    if (dbColumn === 'caso_titulo') {
                        // Convertir a mayúsculas
                        rowDataCasos[dbColumn] = cellValue ? String(cellValue).toUpperCase() : null;
                    } else if (dbColumn === 'titular') {
                        // Eliminar espacios al inicio y al final
                        rowDataCasos[dbColumn] = cellValue ? String(cellValue).trim() : null;
                    } else if (['fecha_de_radicacion', 'fecha_de_registro', 'fecha_de_la_publicacion', 'fecha_de_prioridad'].includes(dbColumn)) {
                        // Convertir fechas al formato YYYY-MM-DD
                        try {
                            if (cellValue instanceof Date) {
                                rowDataCasos[dbColumn] = cellValue.toISOString().split('T')[0];
                            } else if (typeof cellValue === 'number') {
                                // Si la fecha está en formato de número de Excel
                                const excelDate = xlsx.SSF.parse_date_code(cellValue);
                                if (excelDate) {
                                    const date = new Date(excelDate.y, excelDate.m - 1, excelDate.d);
                                    rowDataCasos[dbColumn] = date.toISOString().split('T')[0];
                                } else {
                                    rowDataCasos[dbColumn] = null;
                                }
                            } else if (typeof cellValue === 'string' && cellValue.trim()) {
                                // Intentar parsear la fecha manualmente
                                const parsedDate = new Date(cellValue);
                                rowDataCasos[dbColumn] = isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString().split('T')[0];
                            } else {
                                rowDataCasos[dbColumn] = null;
                            }
                        } catch (dateError) {
                            console.warn(`Error al procesar fecha en fila ${rowNumber}, columna ${dbColumn}: ${dateError.message}`);
                            rowDataCasos[dbColumn] = null;
                        }
                    } else {
                        // Asignar valor directamente
                        rowDataCasos[dbColumn] = cellValue;
                    }
                }
            }

            // Validar que no se están asignando columnas inválidas
            const invalidColumns = Object.keys(rowDataCasos).filter(col => col === '-1');
            if (invalidColumns.length > 0) {
                console.error(`Fila ${rowNumber} tiene columnas inválidas: ${invalidColumns.join(', ')}`);
                rowInfo.motivo = `Columnas inválidas: ${invalidColumns.join(', ')}`;
                errorDetails.push(rowInfo);
                errorRows++;
                continue; // Saltar esta fila
            }

            console.log(`Datos a insertar en la fila ${rowNumber} en 'casos':`, rowDataCasos);

            // Ejecutar la inserción en 'casos'
            try {
                await connection.execute(insertCasosQuery, rowDataCasos);
                console.log(`Fila ${rowNumber} insertada correctamente en 'casos'.`);
            } catch (error) {
                console.error(`Error al insertar la fila ${rowNumber} en 'casos': ${error.message}`);
                console.error(`Detalles del error:`, error);
                rowInfo.motivo = `Error en casos: ${error.message}`;
                errorDetails.push(rowInfo);
                errorRows++;
                continue; // Saltar la inserción en 'scraping_sic' si falla en 'casos'
            }

            // Preparar los datos para 'scraping_sic'
            const scrapingGacData = {
                idsic: rowDataCasos.numero_de_caso_id,
                nreg: rowDataCasos.numero_de_caso_codigo
            };

            console.log(`Datos a insertar en la fila ${rowNumber} en 'scraping_sic':`, scrapingGacData);

            // Validar que ambos campos están presentes antes de insertar
            if (!scrapingGacData.idsic || !scrapingGacData.nreg) {
                console.warn(`Fila ${rowNumber}: 'idsic' o 'nreg' están ausentes. Saltando inserción en 'scraping_sic'.`);
                rowInfo.motivo = `Falta idsic o nreg para scraping_sic`;
                errorDetails.push(rowInfo);
                errorRows++;
                continue;
            }

            // Ejecutar la inserción en 'scraping_sic'
            try {
                await connection.execute(insertScrapingGacQuery, scrapingGacData);
                console.log(`Fila ${rowNumber} insertada correctamente en 'scraping_sic'.`);
                processedDetails.push({
                    fila: rowNumber,
                    numero_caso: rowInfo.numero_caso,
                    id: scrapingGacData.idsic,
                    codigo: scrapingGacData.nreg
                });
                processedRows++;
            } catch (error) {
                console.error(`Error al insertar la fila ${rowNumber} en 'scraping_sic': ${error.message}`);
                console.error(`Detalles del error:`, error);
                rowInfo.motivo = `Error en scraping_sic: ${error.message}`;
                errorDetails.push(rowInfo);
                errorRows++;
                continue;
            }
        }

        console.log('Proceso de importación completado.');

        // Cerrar la conexión
        await connection.end();

        // Crear un mensaje detallado para el resultado
        let detailedMessage = `Proceso completado. Filas procesadas: ${processedRows}, Filas saltadas: ${skippedRows}, Filas con errores: ${errorRows}`;
        
        // Retornar un objeto con el mensaje y los detalles
        return {
            message: detailedMessage,
            details: {
                procesadas: processedDetails,
                saltadas: skippedDetails,
                errores: errorDetails
            }
        };
    } catch (error) {
        console.error('Error:', error.message);
        if (connection && connection.end) await connection.end();
        throw error;
    }
}

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});