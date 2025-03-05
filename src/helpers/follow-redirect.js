// src/helpers/follow-redirect.js
/**
 * Helper para seguir redirecciones utilizando SicScraper
 */
const { SicScraper } = require('../services/scraper');
const fs = require('fs').promises;
const path = require('path');

/**
 * Sigue una redirección y obtiene el HTML final
 * @param {string} expediente - ID del expediente
 * @param {string} redirectUrl - URL de redirección a seguir
 * @returns {Promise<Object>} - Resultado con el HTML obtenido
 */
async function followRedirect(expediente, redirectUrl) {
  console.log(`🔄 Siguiendo redirección para expediente ${expediente}: ${redirectUrl}`);
  
  const scraper = new SicScraper({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // Inicializar el scraper
    await scraper.initialize();
    
    // Navegar directamente a la URL de redirección
    await scraper.page.goto(redirectUrl, { waitUntil: 'load', timeout: 60000 });
    await scraper.page.waitForSelector('body');
    
    // Obtener el contenido HTML
    const html = await scraper.page.content();
    
    // Guardar el HTML obtenido (opcional, como respaldo)
    const fileName = `${expediente}_redirected.html`;
    const filePath = path.join(process.cwd(), 'origen', fileName);
    await fs.writeFile(filePath, html);
    
    console.log(`✅ Redirección seguida y HTML guardado en: ${filePath}`);
    
    return { 
      success: true, 
      html, 
      filePath 
    };
  } catch (error) {
    console.error(`❌ Error al seguir redirección para ${expediente}:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    await scraper.close();
  }
}

/**
 * Extrae el id de proceso (idProc) de una URL de redirección
 * @param {string} redirectUrl - URL de redirección
 * @returns {string|null} - idProc o null si no se encuentra
 */
function extractIdProc(redirectUrl) {
  if (!redirectUrl) return null;
  
  // Buscar en formato idProc=XXXX
  const idProcMatch = redirectUrl.match(/[?&]idProc=([0-9]+)/i);
  if (idProcMatch && idProcMatch[1]) {
    return idProcMatch[1];
  }
  
  // Buscar en formato /XXX/YYY donde YYY es el ID
  const pathMatch = redirectUrl.match(/\/([0-9]+)(?:\?|$)/);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }
  
  return null;
}

/**
 * Procesa un HTML con redirección, siguiéndola si es necesario
 * @param {string} expediente - ID del expediente
 * @param {string} originalHtmlPath - Ruta al HTML original
 * @returns {Promise<Object>} - Resultado con información de redirección
 */
async function processHtmlWithRedirect(expediente, originalHtmlPath) {
  try {
    // Leer el HTML original
    const rawHtml = await fs.readFile(originalHtmlPath, 'utf8');
    
    // Buscar URL de redirección
    const redirectMatch = rawHtml.match(/<div id="first-redirect-url">First Redirect URL: <a href="([^"]+)"/);
    if (!redirectMatch || !redirectMatch[1]) {
      return { 
        success: true, 
        redirected: false,
        message: 'No se encontró redirección',
        htmlPath: originalHtmlPath
      };
    }
    
    const redirectUrl = redirectMatch[1];
    console.log(`🔍 Encontrada redirección en ${expediente}: ${redirectUrl}`);
    
    // Extraer idProc si está disponible
    const idProc = extractIdProc(redirectUrl);
    
    // Verificar si ya tenemos un HTML redirigido guardado
    const redirectedHtmlPath = path.join(process.cwd(), 'origen', `${expediente}_redirected.html`);
    try {
      await fs.access(redirectedHtmlPath);
      console.log(`⏩ Ya existe un HTML redirigido para ${expediente}`);
      
      return {
        success: true,
        redirected: true,
        followed: false,
        message: 'Ya existe un HTML redirigido',
        htmlPath: redirectedHtmlPath,
        redirectUrl,
        idProc
      };
    } catch (error) {
      // El archivo no existe, seguir la redirección
    }
    
    // Seguir la redirección
    const result = await followRedirect(expediente, redirectUrl);
    
    if (result.success) {
      return {
        success: true,
        redirected: true,
        followed: true,
        message: 'Redirección seguida correctamente',
        htmlPath: result.filePath,
        redirectUrl,
        idProc
      };
    } else {
      return {
        success: false,
        redirected: true,
        followed: false,
        message: `Error al seguir redirección: ${result.error}`,
        redirectUrl,
        idProc,
        error: result.error
      };
    }
  } catch (error) {
    console.error(`❌ Error al procesar HTML con redirección para ${expediente}:`, error);
    return {
      success: false,
      redirected: false,
      followed: false,
      message: `Error al procesar HTML: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = {
  followRedirect,
  extractIdProc,
  processHtmlWithRedirect
};