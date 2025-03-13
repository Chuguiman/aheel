// importar.js

const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');



(async () => {
    let connection;

    try {
        // Configuración de la base de datos
        const dbConfig = {
            user: 'root',               // Reemplaza con tu usuario de MySQL
            password: '',               // Reemplaza con tu contraseña de MySQL
            database: 'precarga_sim',           // Reemplaza con el nombre de tu base de datos
            host: 'localhost',
            namedPlaceholders: true    
            // port: 3306
        };

        // Crear conexión a MySQL
        connection = await mysql.createConnection(dbConfig);
        console.log("Conexión exitosa a la base de datos.");

        // Ruta al archivo Excel
        const excelPath = path.resolve(__dirname, 'uploads/Excel_Report28.xlsm');
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
            throw conversionError; // Re-lanzar el error para manejarlo más arriba
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

        // Validar que todas las cabeceras esperadas están presentes
        const expectedHeaders = Object.keys(columnMapping);
        const missingHeaders = expectedHeaders.filter(header => !headers.includes(header));

        if (missingHeaders.length > 0) {
            throw new Error(`Faltan las siguientes cabeceras en el Excel: ${missingHeaders.join(', ')}`);
        }

        // Preparar las columnas y placeholders dinámicamente para la tabla `casos`
        const insertCasosColumns = [];
        const insertCasosPlaceholders = [];

        for (const [excelHeader, dbColumn] of Object.entries(columnMapping)) {
            if (typeof dbColumn === 'object') {
                insertCasosColumns.push(...Object.values(dbColumn)); // 'numero_de_caso_id', 'numero_de_caso_codigo'
                insertCasosPlaceholders.push(...Object.values(dbColumn).map(col => `:${col}`)); // ':numero_de_caso_id', ':numero_de_caso_codigo'
            } else {
                insertCasosColumns.push(dbColumn); // otras columnas
                insertCasosPlaceholders.push(`:${dbColumn}`); // ':caso_titulo', ':imagen', etc.
            }
        }

        const insertCasosQuery = `INSERT INTO casos (${insertCasosColumns.map(col => `\`${col}\``).join(', ')}) VALUES (${insertCasosPlaceholders.join(', ')})`;
        //console.log("Consulta SQL preparada para 'casos':", insertCasosQuery);

        // Preparar la consulta SQL para `scraping_sic`
        const insertScrapingGacQuery = `INSERT INTO scraping_sic (idsic, nreg) VALUES (:idsic, :nreg)`;
        //console.log("Consulta SQL preparada para 'scraping_sic':", insertScrapingGacQuery);

        // Procesar cada fila de datos
        for (const [index, row] of jsonData.entries()) {
            const rowNumber = index + 1; // Número de fila (1-based)

            // Saltar la fila de cabecera
            if (index === 0) {
                console.log(`Fila ${rowNumber} es la cabecera. Saltando.`);
                continue;
            }

            // Saltar filas completamente vacías
            if (headers.every(header => row[header] === null || row[header] === undefined || row[header] === '')) {
                console.log(`Fila ${rowNumber} está vacía. Saltando.`);
                continue;
            }

            const rowDataCasos = {};

            headers.forEach(header => {
                if (columnMapping.hasOwnProperty(header)) {
                    const dbColumn = columnMapping[header];
                    const cellValue = row[header] || null;

                    if (typeof dbColumn === 'object') {
                        // Manejar la columna Número de caso
                        const dbId = dbColumn['id']; // 'numero_de_caso_id'
                        const dbCodigo = dbColumn['codigo']; // 'numero_de_caso_codigo'

                        // Obtener la dirección de la celda
                        const columnIndex = headers.indexOf(header);
                        const cellAddress = xlsx.utils.encode_cell({ c: columnIndex, r: index }); // 0-based
                        const cell = sheet[cellAddress];

                        let numero = null;
                        let codigo = null;

                        if (cell) {
                            console.log(`Fila ${rowNumber}, Celda ${cellAddress}:`);
                            console.log(`cell.f: ${cell.f}`);
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
                            }
                            // Manejar texto simple sin hipervínculo
                            else {
                                numero = null;
                                codigo = cell.v;
                                console.warn(`Fila ${rowNumber}: No se encontró fórmula HYPERLINK ni hipervínculo en la celda.`);
                            }
                        }

                        rowDataCasos[dbId] = numero;
                        rowDataCasos[dbCodigo] = codigo;

                        // Log detallado del mapeo
                        console.log(`Fila ${rowNumber}: numero_de_caso_id = ${numero}, numero_de_caso_codigo = ${codigo}`);
                    } else {
                        // Manejar otras columnas
                        if (dbColumn === 'caso_titulo') {
                            // Convertir a mayúsculas
                            rowDataCasos[dbColumn] = (cellValue || '').toString().toUpperCase();
                        } else if (dbColumn === 'titular') {
                            // Eliminar espacios al inicio y al final
                            rowDataCasos[dbColumn] = (cellValue || '').toString().trim();
                        } else if (['fecha_de_radicacion', 'fecha_de_registro', 'fecha_de_la_publicacion', 'fecha_de_prioridad'].includes(dbColumn)) {
                            // Convertir fechas al formato YYYY-MM-DD
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
                            } else if (typeof cellValue === 'string') {
                                // Intentar parsear la fecha manualmente
                                const parsedDate = new Date(cellValue);
                                rowDataCasos[dbColumn] = isNaN(parsedDate) ? null : parsedDate.toISOString().split('T')[0];
                            } else {
                                rowDataCasos[dbColumn] = null;
                            }
                        } else {
                            // Asignar valor directamente
                            rowDataCasos[dbColumn] = cellValue;
                        }
                    }
                }
            });

            // Validar que no se están asignando columnas inválidas
            const invalidColumns = Object.keys(rowDataCasos).filter(col => col === '-1');
            if (invalidColumns.length > 0) {
                console.error(`Fila ${rowNumber} tiene columnas inválidas: ${invalidColumns.join(', ')}`);
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
                continue;
            }

            // Ejecutar la inserción en 'scraping_sic'
            try {
                await connection.execute(insertScrapingGacQuery, scrapingGacData);
                console.log(`Fila ${rowNumber} insertada correctamente en 'scraping_sic'.`);
            } catch (error) {
                console.error(`Error al insertar la fila ${rowNumber} en 'scraping_sic': ${error.message}`);
                console.error(`Detalles del error:`, error);
                // Dependiendo de tus necesidades, puedes decidir continuar o detener el script
                continue;
            }
        }

        console.log('Proceso de importación completado.');

        // Cerrar la conexión
        await connection.end();
    } catch (error) {
        console.error('Error:', error.message);
        if (connection && connection.end) await connection.end();
        process.exit(1);
    }
})();