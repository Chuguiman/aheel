// src/config/postgres.config.js
require('dotenv').config();

module.exports = {
  user: process.env.PG_USER || "postgres.fgieejrampatcygxhvpy",
  host: process.env.PG_HOST || "aws-0-sa-east-1.pooler.supabase.com",
  database: process.env.PG_DATABASE || "postgres",
  password: process.env.PG_PASSWORD || "2cLa-TVELGbyUwA5",
  port: process.env.PG_PORT || 5432,
};