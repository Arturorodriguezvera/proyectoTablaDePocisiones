'use strict';
require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

// Estado del servidor y de la base de datos.
app.get('/api/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ servidor: 'ok', base_de_datos: 'conectada' });
  } catch (e) {
    res.status(503).json({ servidor: 'ok', base_de_datos: 'sin conexión', detalle: e.code || e.message });
  }
});

const PORT = process.env.PORT || 3000;

async function iniciar() {
  try {
    const [[fila]] = await pool.query('SELECT DATABASE() AS db');
    const [[tablas]] = await pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('carreras','competidores')");
    if (Number(tablas.n) < 2) throw new Error('faltan las tablas (ejecutá database/schema.sql)');
    console.log('✔ Conectado a MySQL, base "' + fila.db + '"');
  } catch (e) {
    console.error('✘ No se pudo usar la base de datos: ' + (e.code || e.message));
    console.error('  Revisá el archivo .env y que hayas ejecutado database/schema.sql');
    process.exit(1);
  }
  app.listen(PORT, () => console.log('✔ Servidor en http://localhost:' + PORT));
}

iniciar();
