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
   * Descarga archivos relacionados con el expediente
   * @param {string} expediente - Identificador del expediente
   */
  async downloadRelatedFiles(expediente) {
    try {
      // Buscar enlaces a archivos multimedia
      const deviceURLs = await this.page.$$eval('.device a', links => 
        links.map(a => a.href)
      );

      if (!deviceURLs || deviceURLs.length === 0) {
        console.log(`ℹ️ No se encontraron archivos multimedia para expediente: ${expediente}`);
        return;
      }

      // Crear directorio para archivos multimedia si no existe
      await ensureDirectoryExists('media');
      
      // Procesar cada URL
      for (const deviceURL of deviceURLs) {
        const parsedUrl = url.parse(deviceURL);
        const queryParams = new URLSearchParams(parsedUrl.query);
        const fileId = queryParams.get('id');

        if (!fileId) {
          console.error('💔 No se encontró el ID en la URL:', deviceURL);
          continue;
        }

        // Determinar la extensión del archivo
        const extension = parsedUrl.pathname.endsWith('.aspx') ? '.pdf' : '';
        const filePath = path.join('media', `${fileId}${extension}`);

        // Descargar el archivo
        await this.downloadFile(deviceURL, filePath);
      }
    } catch (error) {
      console.error('❌ Error al descargar archivos relacionados:', error);
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