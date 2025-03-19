// pdf-processor.js
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const sharp = require('sharp');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const { createCanvas } = require('canvas');

// Configurar worker para pdfjs
const PDFJS = pdfjs;
PDFJS.GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js');

/**
 * Función para procesar todos los PDFs descargados en una carpeta de expediente
 * @param {string} expediente - El número de expediente
 * @returns {Promise<{success: boolean, procesados: number, errores: number}>} - Resultado del procesamiento
 */
async function procesarPdfsExpediente(expediente) {
  try {
    const nombreExpediente = expediente.replace(/\//g, '_');
    const carpetaPdfs = path.join(process.cwd(), 'media', nombreExpediente);
    
    // Verificar si existe la carpeta del expediente
    if (!fs.existsSync(carpetaPdfs)) {
      console.log(`⚠️ No se encontró la carpeta del expediente: ${carpetaPdfs}`);
      return {
        success: true,
        procesados: 0,
        errores: 0,
        mensaje: 'No se encontraron archivos para procesar'
      };
    }
    
    // Crear carpetas de salida
    const carpetaSalida = path.join(carpetaPdfs, 'imgs');
    const carpetaImgUnicas = path.join(carpetaPdfs, 'img_unicas');
    
    if (!fs.existsSync(carpetaSalida)) {
      await mkdirp(carpetaSalida);
    }
    
    if (!fs.existsSync(carpetaImgUnicas)) {
      await mkdirp(carpetaImgUnicas);
    }
    
    // Obtener lista de archivos PDF
    const archivos = fs.readdirSync(carpetaPdfs)
      .filter(archivo => archivo.toLowerCase().endsWith('.pdf'));
    
    if (archivos.length === 0) {
      console.log(`ℹ️ No se encontraron archivos PDF en: ${carpetaPdfs}`);
      return {
        success: true,
        procesados: 0,
        errores: 0,
        mensaje: 'No se encontraron archivos PDF para procesar'
      };
    }
    
    console.log(`🔍 Se encontraron ${archivos.length} archivos PDF para procesar`);
    
    let procesados = 0;
    let errores = 0;
    
    // Procesar cada PDF
    for (const archivo of archivos) {
      try {
        const archivoPdf = path.join(carpetaPdfs, archivo);
        const nombrePdf = path.basename(archivo, '.pdf');
        console.log(`⏳ Procesando PDF: ${archivoPdf}`);
        
        // Extraer imágenes del PDF
        await extraerImagenes(archivoPdf, carpetaSalida);
        
        // Buscar el último archivo PNG generado y copiarlo
        const carpetaPdfGenerada = path.join(carpetaSalida, nombrePdf);
        await seleccionarUltimoPng(carpetaPdfGenerada, carpetaImgUnicas, nombrePdf);
        
        // Incrementar contador de procesados
        procesados++;
        
        // No eliminamos el PDF original para mantener un respaldo
        console.log(`PDF procesado: ${archivoPdf}`);
      } catch (error) {
        console.error(`❌ Error al procesar PDF ${archivo}: ${error.message}`);
        errores++;
      }
    }
    
    return {
      success: true,
      procesados,
      errores,
      totalPdfs: archivos.length,
      mensaje: `Se procesaron ${procesados} de ${archivos.length} archivos PDF. Errores: ${errores}`
    };
    
  } catch (error) {
    console.error(`❌ Error general al procesar PDFs: ${error.message}`);
    return {
      success: false,
      procesados: 0,
      errores: 1,
      mensaje: `Error al procesar PDFs: ${error.message}`
    };
  }
}

// Función para convertir archivos JPX a PNG
async function convertirAPng(rutaImagenJpx) {
  try {
    const rutaPng = rutaImagenJpx.replace('.jpx', '.png');
    await sharp(rutaImagenJpx)
      .toFormat('png')
      .toFile(rutaPng);
    console.log(`Imagen convertida a PNG: ${rutaPng}`);
    return rutaPng;
  } catch (e) {
    console.error(`Error al convertir ${rutaImagenJpx} a PNG: ${e}`);
    return null;
  }
}

// Función para extraer imágenes de un PDF
async function extraerImagenes(pdfPath, carpetaSalida) {
  try {
    // Cargar el PDF
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = PDFJS.getDocument({ data });
    const documento = await loadingTask.promise;
    
    const nombrePdf = path.basename(pdfPath, '.pdf');
    const carpetaPdf = path.join(carpetaSalida, nombrePdf);
    
    // Crear carpeta para las imágenes si no existe
    if (!fs.existsSync(carpetaPdf)) {
      await mkdirp(carpetaPdf);
    }
    
    let imagenExtraida = false;
    
    // Procesar cada página del PDF
    for (let numPagina = 1; numPagina <= documento.numPages; numPagina++) {
      const pagina = await documento.getPage(numPagina);
      const operatorList = await pagina.getOperatorList();
      
      let imgIndex = 0;
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        if (operatorList.fnArray[i] === PDFJS.OPS.paintImageXObject) {
          imgIndex++;
          
          const imageIndex = operatorList.argsArray[i][0]; // nombre de la imagen
          const objs = pagina.objs.get(imageIndex);
          
          if (objs && objs.src) {
            const imageData = objs.src;
            const extension = determinarExtension(imageData);
            
            // Crear un nombre único para la imagen
            const nombreImagen = `${nombrePdf}_${numPagina}_img_${imgIndex}.${extension}`;
            const rutaImagen = path.join(carpetaPdf, nombreImagen);
            
            // Guardar la imagen
            fs.writeFileSync(rutaImagen, Buffer.from(imageData));
            console.log(`Imagen guardada como: ${rutaImagen}`);
            imagenExtraida = true;
            
            // Convertir la imagen a PNG si es JPX
            if (extension === 'jpx') {
              const rutaPng = await convertirAPng(rutaImagen);
              if (rutaPng) {
                console.log(`Imagen convertida a: ${rutaPng}`);
              }
            }
          }
        }
      }
      
      console.log(`Página ${numPagina}: ${imgIndex} imágenes encontradas.`);
      
      // Alternativa: renderizar la página como imagen si no se encuentran imágenes incrustadas
      if (imgIndex === 0) {
        const viewport = pagina.getViewport({ scale: 1.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await pagina.render(renderContext).promise;
        
        const nombreImagen = `${nombrePdf}_${numPagina}_rendered.png`;
        const rutaImagen = path.join(carpetaPdf, nombreImagen);
        
        fs.writeFileSync(rutaImagen, canvas.toBuffer('image/png'));
        console.log(`Página renderizada guardada como: ${rutaImagen}`);
        imagenExtraida = true;
      }
    }
    
    // Si no se extrajeron imágenes, eliminar la carpeta creada vacía
    if (!imagenExtraida) {
      console.log(`No se extrajeron imágenes del PDF: ${pdfPath}`);
      fs.rmdirSync(carpetaPdf);
    }
    
    return true;
  } catch (e) {
    console.error(`Error al procesar el PDF ${pdfPath}: ${e}`);
    throw e;
  }
}

// Función para determinar la extensión de la imagen basada en los bytes
function determinarExtension(imageData) {
  // Versión simplificada: en la práctica necesitarías inspeccionar los headers
  // de los archivos para determinar el tipo exacto
  if (imageData[0] === 0xFF && imageData[1] === 0xD8) {
    return 'jpg';
  } else if (imageData[0] === 0x89 && imageData[1] === 0x50) {
    return 'png';
  } else {
    // Por defecto, asumimos JPX para imágenes que no reconocemos directamente
    return 'jpx';
  }
}

// Función para encontrar el último PNG generado y copiarlo
async function seleccionarUltimoPng(carpetaPdf, carpetaUnicas, nombrePdf) {
  if (!fs.existsSync(carpetaPdf)) {
    console.log(`La carpeta ${carpetaPdf} no existe.`);
    return false;
  }
  
  const archivosPng = fs.readdirSync(carpetaPdf)
    .filter(f => f.endsWith('.png'))
    .map(f => {
      return {
        nombre: f,
        tiempo: fs.statSync(path.join(carpetaPdf, f)).mtime.getTime()
      };
    })
    .sort((a, b) => b.tiempo - a.tiempo);
  
  if (archivosPng.length > 0) {
    const ultimoPng = archivosPng[0].nombre;
    const rutaUltimoPng = path.join(carpetaPdf, ultimoPng);
    
    const destinoPngUnico = path.join(carpetaUnicas, `${nombrePdf}.png`);
    fs.copyFileSync(rutaUltimoPng, destinoPngUnico);
    console.log(`Imagen única copiada a: ${destinoPngUnico}`);
    return true;
  } else {
    console.log(`No se encontraron archivos PNG en la carpeta: ${carpetaPdf}`);
    return false;
  }
}

module.exports = {
  procesarPdfsExpediente
};