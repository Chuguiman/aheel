// src/helpers/utils.js
const fs = require('fs').promises;
const path = require('path');

/**
 * Asegura que un directorio exista, lo crea si no existe
 * @param {string} dirPath - Ruta del directorio
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error(`❌ Error al crear directorio ${dirPath}:`, error);
    return false;
  }
}

/**
 * Elimina un archivo si existe
 * @param {string} filePath - Ruta del archivo
 */
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`🗑️ Archivo eliminado: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error al eliminar archivo ${filePath}:`, error);
    return false;
  }
}

/**
 * Comprueba si un archivo existe
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<boolean>} Verdadero si el archivo existe
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Limpia una cadena de texto (elimina caracteres especiales)
 * @param {string} input - Cadena de entrada
 * @returns {string} Cadena limpia
 */
function cleanString(input) {
  // Eliminar caracteres no ASCII
  return input.replace(/[^\x00-\x7F]/g, "");
}

/**
 * Genera un delay aleatorio para evitar detección de bots
 * @param {number} min - Tiempo mínimo en ms
 * @param {number} max - Tiempo máximo en ms
 * @returns {Promise} Promesa que se resuelve después del delay
 */
function randomDelay(min = 500, max = 2000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`⏱️ Esperando ${delay}ms...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Obtiene todos los archivos de un directorio que coinciden con un patrón
 * @param {string} directory - Ruta del directorio
 * @param {RegExp} pattern - Patrón para filtrar archivos
 * @returns {Promise<Array>} Lista de archivos
 */
async function getFilesFromDirectory(directory, pattern = null) {
  try {
    const files = await fs.readdir(directory);
    if (pattern) {
      return files.filter(file => pattern.test(file));
    }
    return files;
  } catch (error) {
    console.error(`❌ Error al leer directorio ${directory}:`, error);
    return [];
  }
}

/**
 * Crea una estructura de directorios necesarios para el proyecto
 * @param {Object} paths - Objeto con las rutas a crear
 */
async function setupDirectories(paths) {
  for (const [key, value] of Object.entries(paths)) {
    await ensureDirectoryExists(value);
    console.log(`✅ Directorio creado/verificado: ${value}`);
  }
}

module.exports = {
  ensureDirectoryExists,
  deleteFile,
  fileExists,
  cleanString,
  randomDelay,
  getFilesFromDirectory,
  setupDirectories
};