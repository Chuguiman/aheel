// src/config/config.js
require('dotenv').config();

module.exports = {
  scraper: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537',
    baseUrl: 'http://sipi.sic.gov.co/sipi/View.ashx',
    timeout: 60000, // 1 minuto
    waitTime: 3000
  },
  database: {
    // Configuraciones comunes a todas las bases de datos
  },
  paths: {
    origen: './origen',
    json: './json',
    media: './media',
    logs: './logs'
  },
  ignoredImages: [
    "logo-gov-co.png",
    "logo_ind.png",
    "logo_min.png",
    "nuevos_logos.png",
    "bullet_red.png",
    "bullet_red.png",
    "logo-marca-colombia.png",
    "logo_min_360.png"
  ]
};

