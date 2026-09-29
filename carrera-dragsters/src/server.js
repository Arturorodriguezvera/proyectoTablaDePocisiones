'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { calcular, MAX_RONDAS } = require('./posiciones');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Estado del servidor y de la base de datos.
app.get('/api/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ servidor: 'ok', base_de_datos: 'conectada' });
  } catch (e) {
    res.status(503).json({ servidor: 'ok', base_de_datos: 'sin conexión', detalle: e.code || e.message });
  }
});

// ---- Etapa 2: configuración y registro ----
class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const entero = (v, campo) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, campo + ' inválido');
  return n;
};

async function cargar(id) {
  const [[carrera]] = await pool.query('SELECT * FROM carreras WHERE id = ?', [id]);
  if (!carrera) throw new HttpError(404, 'Carrera no encontrada');
  const [competidores] = await pool.query(
    'SELECT id, nombre, numero, estado, tiempo_ms FROM competidores WHERE carrera_id = ? ORDER BY numero', [id]);
  // Puestos, empates y desempates (ver src/posiciones.js).
  const [desempates] = await pool.query('SELECT * FROM desempates WHERE carrera_id = ?', [id]);
  let partes = [];
  if (desempates.length) {
    [partes] = await pool.query(
      'SELECT * FROM desempate_participantes WHERE desempate_id IN (?)', [desempates.map((d) => d.id)]);
  }
  const { puestos, pendiente } = calcular(carrera, competidores, desempates, partes);
  competidores.forEach((c) => { if (puestos.has(c.id)) c.posicion = puestos.get(c.id); });

  const desempate = { estado: null, maximo: MAX_RONDAS };
  if (pendiente) {
    const persona = (c, extra) => ({ id: c.id, nombre: c.nombre, numero: c.numero, ...extra });
    const filas = pendiente.desempate
      ? partes.filter((x) => x.desempate_id === pendiente.desempate.id)
      : null;
    Object.assign(desempate, {
      estado: pendiente.estado, // 'iniciar' (falta largar) o 'en_curso'
      posicion: pendiente.posicion,
      ronda: pendiente.ronda,
      inicio_ms: pendiente.desempate ? pendiente.desempate.inicio_ms : null,
      participantes: filas
        ? filas.map((x) => persona(competidores.find((c) => c.id === x.competidor_id), { estado: x.estado, tiempo_ms: x.tiempo_ms }))
        : competidores.filter((c) => pendiente.ids.includes(c.id)).map((c) => persona(c, { estado: 'en_carrera', tiempo_ms: null })),
    });
  }
  return {
    carrera, competidores, completa: competidores.length >= carrera.cupo, ahora_ms: Date.now(),
    desempate, hay_desempates: desempates.length > 0,
  };
}

app.post('/api/carreras', ah(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const cupo = Number(req.body.cupo);
  if (!nombre || nombre.length > 100) throw new HttpError(400, 'Escribí un nombre para la carrera (hasta 100 letras)');
  if (!Number.isInteger(cupo) || cupo < 2 || cupo > 50) {
    throw new HttpError(400, 'El cupo tiene que ser un número entero entre 2 y 50');
  }
  const [r] = await pool.query('INSERT INTO carreras (nombre, cupo) VALUES (?, ?)', [nombre, cupo]);
  res.status(201).json(await cargar(r.insertId));
}));

app.get('/api/carreras/:id', ah(async (req, res) => {
  res.json(await cargar(entero(req.params.id, 'Id')));
}));

app.post('/api/carreras/:id/competidores', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const nombre = String(req.body.nombre || '').trim();
  const numero = Number(req.body.numero);
  if (!nombre || nombre.length > 80) throw new HttpError(400, 'Escribí el nombre del competidor (hasta 80 letras)');
  if (!Number.isInteger(numero) || numero < 1 || numero > 9999) {
    throw new HttpError(400, 'El número tiene que ser un entero entre 1 y 9999');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Bloquea la carrera para que dos altas simultáneas no pasen el cupo.
    const [[carrera]] = await conn.query('SELECT * FROM carreras WHERE id = ? FOR UPDATE', [id]);
    if (!carrera) throw new HttpError(404, 'Carrera no encontrada');
    if (carrera.estado !== 'configuracion') throw new HttpError(409, 'La carrera ya largó: no se pueden agregar competidores');
    const [[fila]] = await conn.query('SELECT COUNT(*) AS n FROM competidores WHERE carrera_id = ?', [id]);
    if (Number(fila.n) >= carrera.cupo) throw new HttpError(409, 'El cupo ya está completo');
    try {
      await conn.query('INSERT INTO competidores (carrera_id, nombre, numero) VALUES (?, ?, ?)', [id, nombre, numero]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ya hay un competidor con el número ' + numero);
      throw e;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.status(201).json(await cargar(id));
}));

app.delete('/api/carreras/:id/competidores/:cid', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera } = await cargar(id);
  if (carrera.estado !== 'configuracion') throw new HttpError(409, 'La carrera ya largó: no se pueden quitar competidores');
  await pool.query('DELETE FROM competidores WHERE id = ? AND carrera_id = ?', [cid, id]);
  res.json(await cargar(id));
}));

// ---- Etapa 3: largada ----
app.post('/api/carreras/:id/largada', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const { carrera, competidores } = await cargar(id);
  if (carrera.estado !== 'configuracion') throw new HttpError(409, 'La carrera ya largó');
  const faltan = carrera.cupo - competidores.length;
  if (faltan > 0) throw new HttpError(409, 'Faltan ' + faltan + ' competidores para poder largar');
  // El reloj del servidor es la referencia de todos los tiempos.
  const [r] = await pool.query(
    "UPDATE carreras SET estado = 'en_curso', inicio_ms = ? WHERE id = ? AND estado = 'configuracion' AND (SELECT COUNT(*) FROM competidores WHERE carrera_id = ?) = cupo",
    [Date.now(), id, id]);
  if (!r.affectedRows) throw new HttpError(409, 'No se pudo largar: revisá la lista de competidores');
  res.json(await cargar(id));
}));

// ---- Etapa 4: llegadas e incidentes ----
// La carrera termina sola cuando ya nadie sigue en pista.
async function cerrarSiTermino(carreraId) {
  const [[fila]] = await pool.query(
    "SELECT COUNT(*) AS n FROM competidores WHERE carrera_id = ? AND estado = 'en_carrera'", [carreraId]);
  if (Number(fila.n) === 0) {
    await pool.query(
      "UPDATE carreras SET estado = 'finalizada', fin_ms = ? WHERE id = ? AND estado = 'en_curso'",
      [Date.now(), carreraId]);
  }
}

app.post('/api/carreras/:id/competidores/:cid/llegada', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera } = await cargar(id);
  if (carrera.estado !== 'en_curso') throw new HttpError(409, 'La carrera no está en curso');
  const tiempo = Date.now() - carrera.inicio_ms; // el reloj del servidor es la referencia
  const [r] = await pool.query(
    "UPDATE competidores SET estado = 'llego', tiempo_ms = ? WHERE id = ? AND carrera_id = ? AND estado = 'en_carrera'",
    [tiempo, cid, id]);
  if (!r.affectedRows) throw new HttpError(409, 'Ese competidor ya tiene su llegada o incidente registrado');
  await cerrarSiTermino(id);
  res.json(await cargar(id));
}));

app.post('/api/carreras/:id/competidores/:cid/incidente', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera, desempate, hay_desempates: hayDesempates } = await cargar(id);
  if (carrera.estado === 'configuracion') throw new HttpError(409, 'La carrera todavía no largó');
  if (hayDesempates || desempate.estado) {
    throw new HttpError(409, 'Hay un desempate en marcha: ya no se pueden marcar incidentes de la carrera');
  }
  const [r] = await pool.query(
    "UPDATE competidores SET estado = 'incidente', tiempo_ms = NULL WHERE id = ? AND carrera_id = ? AND eliminado = 0 AND estado <> 'incidente'",
    [cid, id]);
  if (!r.affectedRows) throw new HttpError(409, 'Ese competidor ya tiene un incidente registrado');
  if (carrera.estado === 'en_curso') await cerrarSiTermino(id);
  res.json(await cargar(id));
}));

// ---- Etapa 5: desempate ----
app.post('/api/carreras/:id/desempate/iniciar', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const { desempate } = await cargar(id);
  if (desempate.estado !== 'iniciar') throw new HttpError(409, 'No hay ningún desempate para largar');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [d] = await conn.query(
      'INSERT INTO desempates (carrera_id, posicion, ronda, inicio_ms) VALUES (?, ?, ?, ?)',
      [id, desempate.posicion, desempate.ronda, Date.now()]);
    await conn.query(
      'INSERT INTO desempate_participantes (desempate_id, competidor_id) VALUES ?',
      [desempate.participantes.map((c) => [d.insertId, c.id])]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ese desempate ya largó');
    throw e;
  } finally {
    conn.release();
  }
  res.json(await cargar(id));
}));

function marcarDesempate(nuevoEstado) {
  return ah(async (req, res) => {
    const id = entero(req.params.id, 'Id');
    const cid = entero(req.params.cid, 'Competidor');
    const { desempate } = await cargar(id);
    if (desempate.estado !== 'en_curso') throw new HttpError(409, 'No hay un desempate en curso');
    const tiempo = nuevoEstado === 'llego' ? Date.now() - desempate.inicio_ms : null;
    const [r] = await pool.query(
      "UPDATE desempate_participantes dp JOIN desempates d ON d.id = dp.desempate_id SET dp.estado = ?, dp.tiempo_ms = ? WHERE d.carrera_id = ? AND d.posicion = ? AND d.ronda = ? AND dp.competidor_id = ? AND dp.estado = 'en_carrera'",
      [nuevoEstado, tiempo, id, desempate.posicion, desempate.ronda, cid]);
    if (!r.affectedRows) throw new HttpError(409, 'Ese competidor no corre este desempate o ya tiene su resultado');
    res.json(await cargar(id));
  });
}
app.post('/api/carreras/:id/desempate/:cid/llegada', marcarDesempate('llego'));
app.post('/api/carreras/:id/desempate/:cid/incidente', marcarDesempate('incidente'));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
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
