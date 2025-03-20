// app.js - Archivo principal de la aplicación
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Importar el helper de utilidades
const { ensureDirectoryExists } = require('./src/helpers/utils');

// Importar procesadores específicos
const solicitudesProcessor = require('./src/solicitudes-processor');
const gacetaProcessor = require('./src/gaceta-processor');
const downloadExpediente = require('./src/reuse-downloader');

// Importar el procesador de PDF si aún no lo has importado
//const { procesarPdfsExpediente } = require('./src/pdf-processor');

// Importa los módulos necesarios para el procesamiento HTML a JSON
const { processHtmlBatch, saveToDatabase } = require('./src/process-html-to-json');

// Configuración de Express
const app = express();
const port = 3000;

// Asegurar que existen los directorios necesarios
(async function setupDirectories() {
  const dirs = ['src/uploads', 'origen', 'media', 'errors', 'src/services', 'src/helpers'];
  for (const dir of dirs) {
    await ensureDirectoryExists(dir);
  }
})();

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'src', 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Configurar multer sin restricciones de tipo
const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'src', 'public')));

// Servir archivos estáticos desde los directorios de destino
app.use('/origen', express.static('origen'));
app.use('/media', express.static('media'));

// Vista principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'public', 'index.html'));
});

// Si tienes estas funciones implementadas, descomenta estas rutas

// Ruta para procesar solicitudes SIC
app.post('/process', upload.single('excelFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se ha subido ningún archivo' });
  }
  
  try {
    // Procesar el archivo usando el procesador de solicitudes
    const result = await solicitudesProcessor.processExcelFile(req.file.path);
    return res.json({
      success: true,
      message: result.message,
      details: result.details
    });
  } catch (error) {
    console.error('Error al procesar el archivo:', error);
    return res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
});

// Ruta para procesar gacetas SIC
app.post('/process-gaceta', upload.single('excelFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se ha subido ningún archivo' });
  }
  
  try {
    // Procesar el archivo usando el procesador de gacetas
    const result = await gacetaProcessor.processGacetaFile(req.file.path);
    return res.json({
      success: true,
      message: result.message,
      details: result.details
    });
  } catch (error) {
    console.error('Error al procesar el archivo de Gaceta SIC:', error);
    return res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
});


// Ruta para procesar un expediente individual
app.post('/api/standalone/process', async (req, res) => {
  try {
    const { expediente } = req.body;
    
    console.log(`🔄 Procesando expediente individual: ${expediente}`);
    
    // Process the expediente using the downloader that reuses SicScraper
    const resultadoDescarga = await downloadExpediente(expediente);
    console.log('Resultado de descarga:', JSON.stringify(resultadoDescarga, null, 2));
    
    // Aunque el resultado muestre error, comprobamos si se descargó realmente el HTML
    const nombreExpediente = expediente.replace(/\//g, '_');
    const rutaHtml = path.join(process.cwd(), 'origen', `${nombreExpediente}.html`);
    const htmlExiste = fs.existsSync(rutaHtml);
    
    // Si el HTML existe, consideramos que la operación fue parcialmente exitosa
    if (htmlExiste) {
      // Verificar si hay archivos multimedia descargados
      const carpetaMedia = path.join(process.cwd(), 'media', nombreExpediente);
      let conteoMedia = 0;
      
      if (fs.existsSync(carpetaMedia)) {
        try {
          const archivosMedia = fs.readdirSync(carpetaMedia);
          conteoMedia = archivosMedia.length;
        } catch (errMedia) {
          console.log(`Error al leer carpeta de media: ${errMedia.message}`);
        }
      }
      
      // Verificar si hay PDFs para procesar
      let resultadoProcesoPDF = { 
        procesados: 0, 
        errores: 0,
        mensaje: 'No se encontraron archivos PDF para procesar'
      };
      
      // Procesar PDFs si existen
      if (fs.existsSync(carpetaMedia)) {
        console.log(`📊 Iniciando procesamiento de PDFs para expediente: ${expediente}`);
        
        // Verificar si hay archivos PDF en la carpeta
        const archivosMedia = fs.readdirSync(carpetaMedia);
        const tieneArchivoPDF = archivosMedia.some(archivo => archivo.toLowerCase().endsWith('.pdf'));
        
        if (tieneArchivoPDF) {
          try {
            // Comprobamos si la función existe antes de llamarla
            if (typeof procesarPdfsExpediente === 'function') {
              resultadoProcesoPDF = await procesarPdfsExpediente(expediente);
              console.log(`Resultado procesamiento PDFs: ${JSON.stringify(resultadoProcesoPDF)}`);
            } else {
              console.log("La función procesarPdfsExpediente no está disponible");
            }
          } catch (errPdf) {
            console.error(`Error al procesar PDFs: ${errPdf.message}`);
            resultadoProcesoPDF.errores += 1;
            resultadoProcesoPDF.mensaje = `Error al procesar PDFs: ${errPdf.message}`;
          }
        }
      }
      
      // Comprobar si ya existe JSON para este expediente
      const jsonPath = path.join(process.cwd(), 'json', `${nombreExpediente}.json`);
      const jsonExiste = fs.existsSync(jsonPath);
      
      // Construir mensaje de resultado
      let mensajeResultado = `Expediente ${expediente} descargado correctamente.`;
      
      if (resultadoDescarga.warning) {
        mensajeResultado += ` Advertencia: ${resultadoDescarga.warning}`;
      }
      
      if (conteoMedia > 0) {
        mensajeResultado += ` Se descargaron ${conteoMedia} archivos multimedia.`;
      } else {
        mensajeResultado += ` No se descargaron archivos multimedia.`;
      }
      
      if (resultadoProcesoPDF.procesados > 0) {
        mensajeResultado += ` ${resultadoProcesoPDF.mensaje}`;
      }
      
      const response = {
        success: true,
        message: mensajeResultado,
        expediente: expediente,
        details: {
          htmlPath: rutaHtml,
          jsonPath: jsonExiste ? `json/${nombreExpediente}.json` : null,
          mediaCount: conteoMedia,
          mediaPath: path.join('media', nombreExpediente),
          pdfProcesados: resultadoProcesoPDF.procesados,
          pdfErrores: resultadoProcesoPDF.errores,
          htmlStatus: 'success', // Nuevo campo para estado HTML
          jsonStatus: jsonExiste ? 'success' : 'pending', // Nuevo campo para estado JSON
          mediaStatus: conteoMedia > 0 ? 'success' : 'warning', // Nuevo campo para estado media
          mysqlStatus: jsonExiste ? 'success' : 'pending' // Nuevo campo para estado MySQL
        }
      };
      
      console.log('Enviando respuesta al cliente:', JSON.stringify(response, null, 2));
      return res.json(response);

    } else if (!resultadoDescarga.success) {
      // Si no hay HTML y el resultado de descarga muestra error, es un error completo
      return res.status(500).json({
        success: false,
        message: `Error al descargar expediente: ${resultadoDescarga.error || 'No se pudo obtener el HTML'}`,
        expediente: expediente
      });
    } else {
      // Si no hay HTML pero el resultado indica éxito, es un comportamiento extraño
      console.warn(`Comportamiento extraño: descarga.success=true pero no se encontró HTML: ${rutaHtml}`);
      return res.status(500).json({
        success: false,
        message: `Error: Se informó éxito pero no se encontró el HTML`,
        expediente: expediente
      });
    }
    
  } catch (error) {
    console.error(`❌ Error general en el proceso: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Error en el proceso: ${error.message}`
    });
  }
});

// Ruta para convertir HTML a JSON y guardar en MySQL
app.post('/api/standalone/convert-to-json', async (req, res) => {
  try {
    const { expediente } = req.body;
    
    if (!expediente) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un número de expediente válido'
      });
    }
    
    console.log(`🔄 Recibida solicitud para convertir a JSON: ${expediente}`);
    
    // Normalizar el nombre del archivo
    const nombreArchivo = expediente.replace(/\//g, '_');
    const htmlPath = path.join(process.cwd(), 'origen', `${nombreArchivo}.html`);
    
    // Verificar si el archivo HTML existe
    if (!fs.existsSync(htmlPath)) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el archivo HTML para el expediente ${expediente}`
      });
    }
    
    // Importar las funciones especializadas
    const { processHtmlSingle, insertToSimPrecargaSingle } = require('./src/services/single-processor');
    const config = require('./src/config/mysql.config');
    
    // Procesar el HTML a JSON usando la función especializada
    console.log(`📄 Procesando HTML individual: ${htmlPath}`);
    let jsonData;
    try {
      jsonData = await processHtmlSingle(htmlPath);
    } catch (processError) {
      return res.status(500).json({
        success: false,
        message: `Error al procesar el HTML a JSON: ${processError.message}`
      });
    }
    
    if (!jsonData) {
      return res.status(500).json({
        success: false,
        message: 'Error al procesar el HTML a JSON: No se generaron datos'
      });
    }
    
    // Guardar el JSON en un archivo
    const jsonDir = path.join(process.cwd(), 'json');
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }
    
    const jsonPath = path.join(jsonDir, `${nombreArchivo}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`💾 JSON guardado en: ${jsonPath}`);
    
    // Guardar en la base de datos usando la función especializada
    console.log(`🗃️ Guardando en la base de datos usando función especializada...`);
    let dbResult;
    let mysqlStatus = 'error';
    let mysqlError = null;
    
    try {
      // Usar la función especializada para inserción individual
      dbResult = await insertToSimPrecargaSingle(jsonData, config);
      
      // Verificar resultado
      if (dbResult && dbResult.success) {
        console.log('✅ Datos guardados correctamente en MySQL');
        mysqlStatus = 'success';
      } else {
        throw new Error(dbResult.error || 'Error desconocido al insertar en MySQL');
      }
    } catch (dbError) {
      console.error(`❌ Error al guardar en MySQL:`, dbError);
      mysqlError = dbError.message || 'Error desconocido';
      mysqlStatus = 'error';
      
      return res.json({
        success: true,
        warning: true,
        message: `Expediente convertido a JSON pero hubo un error al guardar en la base de datos: ${mysqlError}`,
        jsonPath: `json/${nombreArchivo}.json`,
        mysqlStatus: mysqlStatus,
        mysqlError: mysqlError
      });
    }
    
    // Respuesta exitosa
    return res.json({
      success: true,
      message: 'Expediente convertido a JSON y guardado en la base de datos',
      jsonPath: `json/${nombreArchivo}.json`,
      dbResult,
      mysqlStatus: mysqlStatus
    });
    
  } catch (error) {
    console.error(`❌ Error al convertir a JSON: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Error al procesar: ${error.message}`,
      mysqlStatus: 'error'
    });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`✅ Servidor iniciado en http://localhost:${port}`);
});