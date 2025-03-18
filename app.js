// app.js - Archivo principal de la aplicación
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Importar el helper de utilidades
const { ensureDirectoryExists } = require('./src/helpers/utils');

// Importar el módulo de descarga que reutiliza SicScraper
const downloadExpediente = require('./src/reuse-downloader');

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
/*
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
*/

// Ruta para procesar un expediente individual
app.post('/api/standalone/process', async (req, res) => {
  try {
    const { expediente } = req.body;
    
    if (!expediente) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requiere un número de expediente válido' 
      });
    }
    
    console.log(`🔄 Procesando expediente individual: ${expediente}`);
    
    // Procesar el expediente utilizando el downloader que reutiliza SicScraper
    const result = await downloadExpediente(expediente);
    
    if (!result || result.success === undefined) {
      console.error('La función downloadExpediente retornó un valor inesperado:', result);
      return res.status(500).json({
        success: false,
        message: 'Error al procesar el expediente: resultado de descarga inválido'
      });
    }
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: `Error al procesar el expediente: ${result.error || 'Error desconocido'}`
      });
    }
    
    // Formatear el resultado para la respuesta
    const mediaPath = path.join('media', expediente);
    const jsonPath = path.join(mediaPath, 'media_types.json');
    
    // Verificar si se descargaron archivos multimedia
    let mediaCount = result.mediaCount || 0;
    let mediaMessage = 'No se encontraron archivos multimedia';
    
    if (mediaCount > 0) {
      mediaMessage = `Se descargaron ${mediaCount} archivos multimedia`;
    }
    
    // Retornar una respuesta exitosa
    return res.json({
      success: true,
      message: `Expediente ${expediente} procesado correctamente. ${mediaMessage}`,
      details: {
        htmlPath: result.htmlPath || 'N/A',
        jsonPath: fs.existsSync(jsonPath) ? jsonPath : 'N/A',
        mediaCount: mediaCount,
        mediaPath: mediaPath
      }
    });
    
  } catch (error) {
    console.error('Error al procesar expediente individual:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Error: ${error.message}` 
    });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`✅ Servidor iniciado en http://localhost:${port}`);
});