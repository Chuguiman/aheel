// src/reuse-downloader.js
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Importar las funciones de SicScraper
const { SicScraper } = require('./services/scraper');

/**
 * Función principal para descargar expediente
 * Utiliza las funciones existentes de SicScraper
 * @param {string} expediente - Identificador del expediente
 * @returns {Promise<Object>} - Resultado de la operación
 */
// Modified downloadExpediente function with better error handling
async function downloadExpediente(expediente) {
  let browser = null;
  let page = null;
  let scraper = null;
  
  try {
    // Inicia el navegador y abre una nueva página
    console.log(`🚀 Iniciando descarga para expediente: ${expediente}`);
    
    // Crear instancia de SicScraper
    scraper = new SicScraper({
      headless: 'new', // Para ver el proceso visualmente
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Inicializar el scraper
    await scraper.initialize();
    page = scraper.page;

    // Navega a la página del formulario
    console.log('Navegando a la página del formulario SIC...');
    await page.goto('https://sipi.sic.gov.co/sipi/Extra/IP/TM/Qbe.aspx?', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Hace clic en el elemento que redirige a otra página
    console.log('Haciendo clic en enlace de búsqueda...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.click('#MainContent_lnkTMSearch'),
    ]);

    // Inserta un número de expediente en el campo de entrada
    console.log(`Ingresando expediente: ${expediente}`);
    await page.type('#MainContent_ctrlTMSearch_txtAppNr', expediente);

    // Hace clic en el botón de "Buscar" para enviar el formulario y ver el detalle del expediente
    console.log('Buscando expediente...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.click('#MainContent_ctrlTMSearch_lnkbtnSearch'),
    ]);

    // Espera a que el elemento select esté disponible
    console.log('Verificando elementos en la página de resultados...');
    const selectName = 'ctl00$MainContent$ctrlIRD$ctrlClassif$gvClassifications$ctl13$ctl08';

    // Intenta encontrar el elemento
    const selectElement = await page.$(`select[name='${selectName}']`);
    
    // Si el elemento existe, interactúa con él
    if (selectElement) {
      console.log('Configurando visualización de elementos...');
      // Selecciona la opción con value=50 del menú desplegable
      await page.select(`select[name='${selectName}']`, '50');
      
      // Espera a que la página se actualice después de cambiar el valor del select
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      } catch (navError) {
        console.log('No se detectó navegación después de cambiar el select, continuando...');
        // Esto no deberíamos tratarlo como un error fatal
      }
    } else {
      // El elemento select no existe en esta página, pero esto no debería ser un error crítico
      console.log('El elemento select no se encontró en la página. Continuando con otras acciones...');
    }

    // Guardar el HTML de la página en un archivo
    console.log('Guardando HTML...');
    const html = await page.content();
    const nombreArchivo = expediente.replace(/\//g, '_');
    const htmlPath = path.join('origen', `${nombreArchivo}.html`);
    
    // Asegurarse de que el directorio origen existe
    if (!fs.existsSync('origen')) {
      fs.mkdirSync('origen', { recursive: true });
    }
    
    // Guardar el HTML
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML guardado en: ${htmlPath}`);

    // Descargar archivos relacionados usando la función existente
    console.log('Descargando archivos relacionados...');
    
    // Usar la función de SicScraper para descargar los archivos relacionados
    let mediaTypes = {};
    let mediaCount = 0;
    
    try {
      mediaTypes = await scraper.downloadRelatedFiles(expediente);
      mediaCount = Object.keys(mediaTypes).length;
    } catch (mediaError) {
      console.warn(`⚠️ Advertencia al descargar archivos multimedia: ${mediaError.message}`);
      // Continuamos incluso si hay un error con los archivos multimedia
    }
    
    // Cerrar el scraper
    await scraper.close();
    scraper = null;
    
    return {
      success: true,
      htmlPath: htmlPath,
      mediaCount: mediaCount,
      mediaPath: path.join('media', expediente),
    };
    
  } catch (error) {
    console.error(`❌ Error al procesar expediente: ${error.message}`);
    
    try {
      // Toma screenshot en caso de error para depuración
      if (scraper && scraper.page) {
        // Asegurarse de que existe el directorio errors
        if (!fs.existsSync('errors')) {
          fs.mkdirSync('errors', { recursive: true });
        }
        
        const screenshotPath = path.join('errors', `error_${Date.now()}.png`);
        await scraper.page.screenshot({ path: screenshotPath });
        console.log(`📸 Screenshot de error guardado en: ${screenshotPath}`);
      }
    } catch (screenshotError) {
      console.log('Error al tomar screenshot:', screenshotError.message);
    }
    
    // Comprobar si el HTML se descargó a pesar del error
    const nombreArchivo = expediente.replace(/\//g, '_');
    const htmlPath = path.join('origen', `${nombreArchivo}.html`);
    
    // Si el HTML existe, consideramos que la operación fue parcialmente exitosa
    if (fs.existsSync(htmlPath)) {
      console.log(`⚠️ Se detectó error pero el HTML fue descargado en: ${htmlPath}`);
      
      // Cerrar el scraper antes de retornar
      if (scraper) await scraper.close();
      
      return {
        success: true, // Cambiamos a true si al menos el HTML se descargó
        htmlPath: htmlPath,
        mediaCount: 0,
        mediaPath: path.join('media', expediente),
        warning: error.message // Incluimos el error como advertencia
      };
    }
    
    // Cerrar el scraper en caso de error
    if (scraper) {
      await scraper.close();
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = downloadExpediente;