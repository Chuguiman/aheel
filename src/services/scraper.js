// services/scraper.js
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { ensureDirectoryExists } = require('../helpers/utils');

/**
 * Clase base para scraping
 */
class Scraper {
  constructor(options = {}) {
    this.options = {
      headless: 'new',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      timeout: 60000,
      waitTime: 3000,
      baseUrl: 'http://sipi.sic.gov.co/sipi/View.ashx',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  /**
   * Inicializa el navegador y la página
   */
  async initialize() {
    try {
      this.browser = await puppeteer.launch({ 
        headless: this.options.headless,
        args: this.options.args || []
      });
      this.page = await this.browser.newPage();
      await this.page.setUserAgent(this.options.userAgent);
      
      // Asegurar que existen las carpetas necesarias
      await ensureDirectoryExists('origen');
      await ensureDirectoryExists('media');
      
      console.log('🚀 Navegador inicializado');
      return true;
    } catch (error) {
      console.error('❌ Error al inicializar Puppeteer:', error);
      return false;
    }
  }

  /**
   * Cierra el navegador
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('👋 Navegador cerrado');
    }
  }
}

/**
 * Clase específica para el scraping de expedientes SIC
 * @extends Scraper
 */
class SicScraper extends Scraper {
  constructor(options = {}) {
    super(options);
    this.redirectURL = null;
  }

  /**
   * Procesa un expediente y descarga su HTML y recursos
   * @param {string} expediente - Identificador del expediente
   */
  async processExpediente(expediente) {
    if (!this.page) {
      await this.initialize();
    }

    let firstRedirectCaptured = false;
    this.redirectURL = null;

    // Configurar captura de redirecciones
    this.page.on('response', (response) => {
      if (response.status() === 302 && !firstRedirectCaptured) {
        this.redirectURL = response.headers().location;
        firstRedirectCaptured = true;
      }
    });

    const targetURL = `${this.options.baseUrl}?${expediente}`;
    console.log(`🌐 Navegando a: ${targetURL}`);

    try {
      await this.page.goto(targetURL, { waitUntil: 'load', timeout: this.options.timeout });
      await this.page.waitForSelector('body');

      // Cambiar el valor del selector a 50 (registros por página)
      await this.page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        selects.forEach((select) => {
          if (Array.from(select.options).some(option => option.value === '50')) {
            select.value = '50';
            select.dispatchEvent(new Event('change'));
          }
        });
      });

      // Esperar a que se carguen los nuevos resultados
      await new Promise(resolve => setTimeout(resolve, this.options.waitTime));

      // Obtener el contenido HTML
      let html = await this.page.content();
      
      // Añadir información de redirección si existe
      if (this.redirectURL) {
        const redirectHTML = `<div id="first-redirect-url">First Redirect URL: <a href="${this.redirectURL}">${this.redirectURL}</a></div>`;
        html = html.replace('</body>', `${redirectHTML}\n</body>`);
      }

      // Guardar el HTML
      const fileName = expediente.replace(/\//g, '_');
      const filePath = path.join('origen', `${fileName}.html`);
      
      await fs.promises.writeFile(filePath, html);
      console.log(`1️⃣ HTML guardado en ${filePath}`);

      // Descargar archivos relacionados
      await this.downloadRelatedFiles(expediente);

      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error procesando expediente ${expediente}:`, error);
      return { success: false, error: error.message };
    }
  }


/**
 * Descarga y categoriza archivos relacionados con el expediente
 * @param {string} expediente - Identificador del expediente
 * @returns {Object} - Objeto con tipos de medios para actualizar el JSON
 */
async downloadRelatedFiles(expediente) {
  try {
    // Buscar todos los enlaces a archivos con sus clases
    const mediaLinksData = await this.page.$$eval(
      'a.device, a.devicePopup, a.devicePdf, a.deviceMusic, .device a[href]', 
      links => links.map(a => ({
        url: a.href,
        className: a.className || ''
      }))
    );
    
    // Si no hay archivos, salir sin crear directorios
    if (!mediaLinksData || mediaLinksData.length === 0) {
      console.log(`ℹ️ No se encontraron archivos multimedia para expediente: ${expediente}`);
      return {};
    }
    
    console.log(`🔍 Encontrados ${mediaLinksData.length} archivos multimedia`);
    
    // Objeto para almacenar IDs de medios y sus tipos detectados
    const mediaTypes = {};
    let directoryCreated = false;
    const mediaDir = path.join('media', expediente);
    
    // Procesar cada URL
    for (let i = 0; i < mediaLinksData.length; i++) {
      const mediaData = mediaLinksData[i];
      const mediaUrl = mediaData.url;
      const elementClass = mediaData.className || '';
      
      const parsedUrl = url.parse(mediaUrl);
      const queryParams = new URLSearchParams(parsedUrl.query);
      const fileId = queryParams.get('id');
      
      if (!fileId) {
        console.error('💔 No se encontró el ID en la URL:', mediaUrl);
        continue;
      }
      
      try {
        // Descargar contenido del archivo
        const response = await axios({
          url: mediaUrl,
          method: 'GET',
          responseType: 'arraybuffer'
        });
        
        const buffer = Buffer.from(response.data);
        
        // Realizar detección de tipo
        let detectedType = 'unknown';
        if (elementClass.includes('deviceMusic')) {
          detectedType = 'audio';
        } else if (elementClass.includes('devicePdf')) {
          detectedType = 'pdf';
        } else {
          detectedType = this.detectFileType(buffer);
        }
        
        // Crear el directorio solo cuando tenemos un archivo válido para guardar
        if (!directoryCreated) {
          await ensureDirectoryExists(mediaDir);
          directoryCreated = true;
        }
        
        // Guardar el archivo con la extensión correcta
        const extension = this.getExtensionByType(detectedType);
        const filePath = path.join(mediaDir, `${fileId}${extension}`);
        await fs.promises.writeFile(filePath, buffer);
        
        // Guardar el tipo detectado para el JSON
        mediaTypes[fileId] = detectedType;
        
        console.log(`📥 Archivo ${i+1}/${mediaLinksData.length} descargado: ${fileId} (${detectedType})`);
      } catch (error) {
        console.error(`❌ Error al descargar archivo ${fileId}:`, error.message);
      }
    }
    
    // Guardar la información de tipos solo si se creó el directorio
    if (directoryCreated && Object.keys(mediaTypes).length > 0) {
      const typesFilePath = path.join(mediaDir, 'media_types.json');
      await fs.promises.writeFile(typesFilePath, JSON.stringify(mediaTypes, null, 2));
      console.log(`✅ ${Object.keys(mediaTypes).length} archivos multimedia procesados correctamente`);
    } else {
      console.log(`ℹ️ No se guardaron archivos para el expediente: ${expediente}`);
    }
    
    return mediaTypes;
  } catch (error) {
    console.error(`❌ Error al descargar archivos relacionados para ${expediente}:`, error);
    return {};
  }
}

/**
 * Detecta el tipo de archivo basado en sus primeros bytes
 * @param {Buffer} buffer - Buffer con el contenido del archivo
 * @returns {string} - Tipo de archivo ('image', 'pdf', 'audio', 'unknown')
 */
detectFileType(buffer) {
  // Sin contenido o buffer demasiado pequeño
  if (!buffer || buffer.length < 4) {
    return 'unknown';
  }
  
  // Detectar MP3 (ID3v2 header)
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio';
  }
  
  // Detectar MP3 (MPEG frame sync)
  if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
    return 'audio';
  }
  
  // Detectar WAV
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && 
      buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'audio';
  }
  
  // Detectar PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && 
      buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }
  
  // Detectar JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    return 'image';
  }
  
  // Detectar PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && 
      buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image';
  }
  
  return 'unknown';
}

  /**
   * Obtiene la extensión correcta basada en el tipo de archivo
   * @param {string} type - Tipo de archivo detectado
   * @returns {string} - Extensión del archivo con punto
   */
  getExtensionByType(type) {
    switch (type) {
      case 'audio': return '.mp3';
      case 'image': return '.jpg';
      case 'pdf': return '.pdf';
      default: return '.pdf';
    }
  }

  /**
   * Descarga un archivo desde una URL
   * @param {string} fileUrl - URL del archivo
   * @param {string} filePath - Ruta donde guardar el archivo
   */
  async downloadFile(fileUrl, filePath) {
    try {
      const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'stream',
      });

      // Guardar el archivo
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log('📸 Media/Logo descargado y guardado en:', filePath);
          resolve();
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('❌ Error al descargar el archivo:', error);
      throw error;
    }
  }
}

module.exports = {
  Scraper,
  SicScraper
};