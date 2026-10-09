'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { calcular, MAX_RONDAS } = require('./posiciones');

// Cuenta regresiva antes de cada largada (3, 2, 1). Se puede cambiar con CUENTA_REGRESIVA_MS en el .env; 0 la desactiva.
const CUENTA_REGRESIVA_MS = process.env.CUENTA_REGRESIVA_MS === undefined ? 3000 : Number(process.env.CUENTA_REGRESIVA_MS);

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
    'SELECT id, nombre, numero, estado, tiempo_ms, eliminado FROM competidores WHERE carrera_id = ? ORDER BY numero', [id]);
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
  // Ganadores: los del 1.er puesto, recién cuando la carrera terminó y no falta ningún desempate.
  const ganadores = carrera.estado === 'finalizada' && !pendiente
    ? competidores.filter((c) => c.posicion === 1).map((c) => c.id)
    : [];
  // Mejor tiempo de todas las carreras guardadas (etapa 20): las pantallas lo destacan en quien lo tenga. Solo cuentan los
  // tiempos de llegada de la carrera (no los de desempate) y los competidores que no fueron eliminados de la tabla final.
  const [[mejor]] = await pool.query(
    "SELECT MIN(tiempo_ms) AS m FROM competidores WHERE estado = 'llego' AND eliminado = 0 AND tiempo_ms IS NOT NULL");
  return {
    carrera, competidores, completa: competidores.length >= carrera.cupo, ahora_ms: Date.now(),
    desempate, hay_desempates: desempates.length > 0, ganadores,
    mejor_tiempo_ms: mejor.m === null ? null : Number(mejor.m),
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

// ---- Etapa 12: historial de carreras ----
app.get('/historial', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'historial.html')));

// Las 50 carreras más recientes, con su resumen (ganador/es incluido).
app.get('/api/carreras', ah(async (req, res) => {
  const [filas] = await pool.query('SELECT id FROM carreras ORDER BY id DESC LIMIT 50');
  const lista = [];
  for (const f of filas) {
    const e = await cargar(f.id);
    lista.push({
      id: e.carrera.id, nombre: e.carrera.nombre, estado: e.carrera.estado, cupo: e.carrera.cupo,
      creada_en: e.carrera.creada_en, inicio_ms: e.carrera.inicio_ms, fin_ms: e.carrera.fin_ms,
      empate_pendiente: Boolean(e.desempate.estado),
      ganadores: e.competidores.filter((c) => e.ganadores.includes(c.id)).map((c) => c.nombre),
    });
  }
  res.json(lista);
}));

// ---- Etapa 9: vista de proyector ----
app.get('/proyector', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'proyector.html')));

// La carrera más reciente: es la que muestra el proyector. Va antes de /:id para que no se confunda.
app.get('/api/carreras/actual', ah(async (req, res) => {
  const [[ultima]] = await pool.query('SELECT id FROM carreras ORDER BY id DESC LIMIT 1');
  if (!ultima) throw new HttpError(404, 'Todavía no hay ninguna carrera');
  res.json(await cargar(ultima.id));
}));

app.get('/api/carreras/:id', ah(async (req, res) => {
  res.json(await cargar(entero(req.params.id, 'Id')));
}));

// Valida y limpia el nombre y el número de un competidor (sirve para el alta y para la edición).
function datosCompetidor(cuerpo) {
  const nombre = String(cuerpo.nombre || '').trim();
  const numero = Number(cuerpo.numero);
  if (!nombre || nombre.length > 80) throw new HttpError(400, 'Escribí el nombre del competidor (hasta 80 letras)');
  if (!Number.isInteger(numero) || numero < 1 || numero > 9999) {
    throw new HttpError(400, 'El número tiene que ser un entero entre 1 y 9999');
  }
  return { nombre, numero };
}

app.post('/api/carreras/:id/competidores', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const { nombre, numero } = datosCompetidor(req.body);
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

// ---- Etapa 15: editar competidores ----
// Corrige el nombre o el número de un competidor (por ejemplo, si se escribió mal). Se puede en cualquier momento de la
// carrera: no cambia tiempos, llegadas ni puestos. El número no puede repetirse dentro de la carrera.
app.put('/api/carreras/:id/competidores/:cid', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { nombre, numero } = datosCompetidor(req.body);
  const [[existe]] = await pool.query(
    'SELECT id FROM competidores WHERE id = ? AND carrera_id = ? AND eliminado = 0', [cid, id]);
  if (!existe) throw new HttpError(404, 'Competidor no encontrado');
  try {
    await pool.query('UPDATE competidores SET nombre = ?, numero = ? WHERE id = ? AND carrera_id = ?', [nombre, numero, cid, id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ya hay un competidor con el número ' + numero);
    throw e;
  }
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
    [Date.now() + CUENTA_REGRESIVA_MS, id, id]); // inicio_ms queda en el futuro: el reloj arranca en el "ya"
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

// Si todos los competidores tuvieron un incidente, la carrera se repite con los mismos participantes:
// vuelve a "configuracion" (lista completa, lista para largar) y se borran tiempos, desempates y eliminaciones.
async function repetirSiTodosFallaron(carreraId) {
  const [[fila]] = await pool.query(
    "SELECT COUNT(*) AS total, SUM(estado = 'incidente') AS fallaron FROM competidores WHERE carrera_id = ? AND eliminado = 0",
    [carreraId]);
  if (Number(fila.total) === 0 || Number(fila.fallaron) !== Number(fila.total)) return false;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM desempates WHERE carrera_id = ?', [carreraId]);
    await conn.query("UPDATE competidores SET estado = 'en_carrera', tiempo_ms = NULL, eliminado = 0 WHERE carrera_id = ?", [carreraId]);
    await conn.query("UPDATE carreras SET estado = 'configuracion', inicio_ms = NULL, fin_ms = NULL WHERE id = ?", [carreraId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return true;
}

app.post('/api/carreras/:id/competidores/:cid/llegada', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera } = await cargar(id);
  if (carrera.estado !== 'en_curso') throw new HttpError(409, 'La carrera no está en curso');
  if (Date.now() < carrera.inicio_ms) throw new HttpError(409, 'Todavía no largó: esperá el ¡ya!');
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
  if (Date.now() < carrera.inicio_ms) throw new HttpError(409, 'Todavía no largó: esperá el ¡ya!');
  if (hayDesempates || desempate.estado) {
    throw new HttpError(409, 'Hay un desempate en marcha: ya no se pueden marcar incidentes de la carrera');
  }
  const [r] = await pool.query(
    "UPDATE competidores SET estado = 'incidente', tiempo_ms = NULL WHERE id = ? AND carrera_id = ? AND eliminado = 0 AND estado <> 'incidente'",
    [cid, id]);
  if (!r.affectedRows) throw new HttpError(409, 'Ese competidor ya tiene un incidente registrado');
  const repetida = await repetirSiTodosFallaron(id);
  if (!repetida && carrera.estado === 'en_curso') await cerrarSiTermino(id);
  res.json({ ...(await cargar(id)), repetida }); // repetida: true avisa a la pantalla que la carrera se reinició
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
      [id, desempate.posicion, desempate.ronda, Date.now() + CUENTA_REGRESIVA_MS]);
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
    if (Date.now() < desempate.inicio_ms) throw new HttpError(409, 'Todavía no largó el desempate: esperá el ¡ya!');
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

// ---- Etapa 8: deshacer una llegada o un incidente ----
app.post('/api/carreras/:id/competidores/:cid/deshacer', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera, hay_desempates: hayDesempates } = await cargar(id);
  if (carrera.estado === 'configuracion') throw new HttpError(409, 'La carrera todavía no largó');
  if (hayDesempates) throw new HttpError(409, 'Ya largó un desempate: no se puede deshacer');
  const [r] = await pool.query(
    "UPDATE competidores SET estado = 'en_carrera', tiempo_ms = NULL WHERE id = ? AND carrera_id = ? AND eliminado = 0 AND estado <> 'en_carrera'",
    [cid, id]);
  if (!r.affectedRows) throw new HttpError(409, 'Ese competidor ya está en pista');
  // Si la carrera ya había terminado, se reabre y el reloj sigue contando desde la largada.
  await pool.query("UPDATE carreras SET estado = 'en_curso', fin_ms = NULL WHERE id = ? AND estado = 'finalizada'", [id]);
  res.json(await cargar(id));
}));

// ---- Etapa 6: eliminación manual (con la carrera terminada y el ganador definido) ----
app.post('/api/carreras/:id/competidores/:cid/eliminar', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const cid = entero(req.params.cid, 'Competidor');
  const { carrera, desempate, ganadores } = await cargar(id);
  if (carrera.estado !== 'finalizada') throw new HttpError(409, 'La carrera todavía no terminó');
  if (desempate.estado) throw new HttpError(409, 'Primero hay que resolver el desempate');
  if (ganadores.includes(cid)) throw new HttpError(409, 'No se puede eliminar al ganador');
  const [r] = await pool.query(
    'UPDATE competidores SET eliminado = 1 WHERE id = ? AND carrera_id = ? AND eliminado = 0', [cid, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Competidor no encontrado');
  res.json(await cargar(id));
}));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

// Abre la pantalla de control en el navegador. Solo se usa si ABRIR_NAVEGADOR=1 (lo pone iniciar.bat).
function abrirNavegador(url) {
  const { exec } = require('child_process');
  const comando = process.platform === 'win32' ? 'start "" "' + url + '"'
    : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
  exec(comando, () => {}); // si no se pudo abrir, no pasa nada: la dirección ya salió en la consola
}

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
  app.listen(PORT, () => {
    console.log('✔ Servidor en http://localhost:' + PORT);
    if (process.env.ABRIR_NAVEGADOR === '1' && /^\d+$/.test(String(PORT))) abrirNavegador('http://localhost:' + PORT);
  });
}

iniciar();
