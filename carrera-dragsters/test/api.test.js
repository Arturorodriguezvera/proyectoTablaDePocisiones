'use strict';
// Prueba de punta a punta de la API. Necesita el servidor prendido (npm start).
// Uso: npm run probar. Crea carreras "TEST ..." y las borra al terminar.
const assert = require('assert');
const pool = require('../src/db');

const BASE = process.env.BASE || 'http://localhost:' + (process.env.PORT || 3000);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(metodo, url, cuerpo) {
  const r = await fetch(BASE + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
async function bien(metodo, url, cuerpo) {
  const r = await api(metodo, url, cuerpo);
  assert.ok(r.status < 300, metodo + ' ' + url + ' dio ' + r.status + ': ' + JSON.stringify(r.body));
  return r.body;
}
async function falla(metodo, url, estado, cuerpo) {
  const r = await api(metodo, url, cuerpo);
  assert.strictEqual(r.status, estado, metodo + ' ' + url + ' tenía que dar ' + estado + ' y dio ' + r.status);
}

// Ayudas
const ruta = (id, cid, accion) => '/api/carreras/' + id + '/competidores/' + cid + '/' + accion;
const largar = (id) => bien('POST', '/api/carreras/' + id + '/largada');
const estado = (id) => bien('GET', '/api/carreras/' + id);
const llegar = async (id, cid) => { await dormir(25); return bien('POST', ruta(id, cid, 'llegada')); };
const incidente = (id, cid) => bien('POST', ruta(id, cid, 'incidente'));
const iniciarDes = (id) => bien('POST', '/api/carreras/' + id + '/desempate/iniciar');
const llegarDes = async (id, cid) => { await dormir(25); return bien('POST', '/api/carreras/' + id + '/desempate/' + cid + '/llegada'); };
const incidenteDes = (id, cid) => bien('POST', '/api/carreras/' + id + '/desempate/' + cid + '/incidente');
const puestos = (e) => Object.fromEntries(e.competidores.filter((c) => c.posicion).map((c) => [c.numero, c.posicion]));
const fijarTiempo = (cid, ms) => pool.query('UPDATE competidores SET tiempo_ms = ? WHERE id = ?', [ms, cid]);
const fijarDes = (id, pos, ronda, pares) => Promise.all(pares.map(([cid, ms]) => pool.query(
  'UPDATE desempate_participantes dp JOIN desempates d ON d.id = dp.desempate_id SET dp.tiempo_ms = ? WHERE d.carrera_id = ? AND d.posicion = ? AND d.ronda = ? AND dp.competidor_id = ?',
  [ms, id, pos, ronda, cid])));

async function nueva(cupo) {
  const c = await bien('POST', '/api/carreras', { nombre: 'TEST ' + Date.now(), cupo });
  const id = c.carrera.id;
  let e;
  for (let i = 1; i <= cupo; i++) e = await bien('POST', '/api/carreras/' + id + '/competidores', { nombre: 'P' + i, numero: i });
  return { id, ids: e.competidores.map((x) => x.id) }; // ids ordenados por número
}

// Carrera terminada con tiempos forzados (ms por competidor, en orden de número).
async function terminada(tiempos) {
  const { id, ids } = await nueva(tiempos.length);
  await largar(id);
  for (const cid of ids) await bien('POST', ruta(id, cid, 'llegada'));
  for (let i = 0; i < ids.length; i++) await fijarTiempo(ids[i], tiempos[i]);
  return { id, ids, e: await estado(id) };
}

const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

caso('cupo, números repetidos y largada incompleta', async () => {
  const c = await bien('POST', '/api/carreras', { nombre: 'TEST cupo', cupo: 2 });
  const id = c.carrera.id;
  await falla('POST', '/api/carreras', 400, { nombre: 'TEST malo', cupo: 1 });
  await bien('POST', '/api/carreras/' + id + '/competidores', { nombre: 'A', numero: 7 });
  await falla('POST', '/api/carreras/' + id + '/competidores', 409, { nombre: 'B', numero: 7 });
  await falla('POST', '/api/carreras/' + id + '/largada', 409); // falta uno
  await bien('POST', '/api/carreras/' + id + '/competidores', { nombre: 'B', numero: 8 });
  await falla('POST', '/api/carreras/' + id + '/competidores', 409, { nombre: 'C', numero: 9 }); // cupo lleno
  const { ids } = { ids: (await estado(id)).competidores.map((x) => x.id) };
  await falla('POST', ruta(id, ids[0], 'llegada'), 409); // todavía no largó
  await falla('POST', ruta(id, ids[0], 'incidente'), 409);
});

caso('carrera normal: puestos por tiempo y un ganador', async () => {
  const { id, ids } = await nueva(3);
  await largar(id);
  await llegar(id, ids[1]);
  await llegar(id, ids[0]);
  await falla('POST', ruta(id, ids[1], 'llegada'), 409); // llegada repetida
  const e = await incidente(id, ids[2]);
  assert.strictEqual(e.carrera.estado, 'finalizada');
  assert.ok(e.carrera.fin_ms >= e.carrera.inicio_ms);
  assert.deepStrictEqual(e.ganadores, [ids[1]]);
  assert.deepStrictEqual(puestos(e), { 2: 1, 1: 2 });
});

caso('todos con incidente: la carrera se repite con los mismos participantes', async () => {
  const { id, ids } = await nueva(2);
  await largar(id);
  const medio = await incidente(id, ids[0]);
  assert.strictEqual(medio.repetida, false); // todavía queda uno en pista
  const e = await incidente(id, ids[1]);
  assert.strictEqual(e.repetida, true);
  assert.strictEqual(e.carrera.estado, 'configuracion');
  assert.strictEqual(e.carrera.inicio_ms, null);
  assert.strictEqual(e.completa, true);
  assert.deepStrictEqual(e.competidores.map((c) => c.id), ids);
  assert.ok(e.competidores.every((c) => c.estado === 'en_carrera' && c.tiempo_ms === null && !c.eliminado));
  assert.deepStrictEqual(e.ganadores, []);
  // Se puede largar de nuevo y terminar normalmente.
  await largar(id);
  await llegar(id, ids[0]);
  const fin = await incidente(id, ids[1]);
  assert.strictEqual(fin.repetida, false);
  assert.strictEqual(fin.carrera.estado, 'finalizada');
  assert.deepStrictEqual(fin.ganadores, [ids[0]]);
});

caso('un incidente posterior que deja a todos fuera también repite la carrera', async () => {
  const { id, ids } = await nueva(2);
  await largar(id);
  await llegar(id, ids[0]);
  await incidente(id, ids[1]); // la carrera termina y gana ids[0]
  const e = await incidente(id, ids[0]); // ahora todos tienen incidente
  assert.strictEqual(e.repetida, true);
  assert.strictEqual(e.carrera.estado, 'configuracion');
});

caso('un solo corredor llega', async () => {
  const { id, ids } = await nueva(3);
  await largar(id);
  await llegar(id, ids[0]);
  await incidente(id, ids[1]);
  const e = await incidente(id, ids[2]);
  assert.strictEqual(e.carrera.estado, 'finalizada');
  assert.deepStrictEqual(e.ganadores, [ids[0]]);
});

caso('doble clic: solo una acción vale', async () => {
  const { id, ids } = await nueva(2);
  const largadas = await Promise.all([api('POST', '/api/carreras/' + id + '/largada'), api('POST', '/api/carreras/' + id + '/largada')]);
  assert.deepStrictEqual(largadas.map((r) => r.status).sort(), [200, 409]);
  const llegadas = await Promise.all([api('POST', ruta(id, ids[0], 'llegada')), api('POST', ruta(id, ids[0], 'llegada'))]);
  assert.deepStrictEqual(llegadas.map((r) => r.status).sort(), [200, 409]);
  const c = await bien('POST', '/api/carreras', { nombre: 'TEST concurrencia', cupo: 2 });
  const altas = await Promise.all([1, 2, 3, 4].map((n) => api('POST', '/api/carreras/' + c.carrera.id + '/competidores', { nombre: 'X' + n, numero: n })));
  assert.strictEqual(altas.filter((r) => r.status === 201).length, 2);
});

caso('empate por el 1.º puesto: desempate y ganador', async () => {
  const { id, ids, e } = await terminada([12000, 12005, 15000]);
  assert.strictEqual(e.desempate.estado, 'iniciar');
  assert.strictEqual(e.desempate.posicion, 1);
  assert.deepStrictEqual(e.desempate.participantes.map((p) => p.id), [ids[0], ids[1]]);
  assert.deepStrictEqual(e.ganadores, []);
  await falla('POST', ruta(id, ids[2], 'eliminar'), 409); // desempate pendiente
  await iniciarDes(id);
  await falla('POST', ruta(id, ids[2], 'incidente'), 409); // ya no se editan incidentes
  await llegarDes(id, ids[1]);
  const fin = await llegarDes(id, ids[0]);
  assert.strictEqual(fin.desempate.estado, null);
  assert.deepStrictEqual(fin.ganadores, [ids[1]]);
  assert.deepStrictEqual(puestos(fin), { 2: 1, 1: 2, 3: 3 });
});

caso('desempate con un incidente', async () => {
  const { id, ids } = await terminada([12000, 12005, 15000]);
  await iniciarDes(id);
  await incidenteDes(id, ids[0]);
  const e = await llegarDes(id, ids[1]);
  assert.deepStrictEqual(e.ganadores, [ids[1]]);
  assert.deepStrictEqual(puestos(e), { 2: 1, 1: 2, 3: 3 });
});

caso('tres intentos y siguen empatados: ganan todos los empatados', async () => {
  const { id, ids } = await terminada([12000, 12005, 15000]);
  for (let ronda = 1; ronda <= 3; ronda++) {
    const antes = await estado(id);
    assert.strictEqual(antes.desempate.estado, 'iniciar');
    assert.strictEqual(antes.desempate.ronda, ronda);
    await iniciarDes(id);
    await llegarDes(id, ids[0]);
    await llegarDes(id, ids[1]);
    await fijarDes(id, 1, ronda, [[ids[0], 9000], [ids[1], 9003]]); // fuerza el empate otra vez
  }
  const e = await estado(id);
  assert.strictEqual(e.desempate.estado, null);
  assert.deepStrictEqual(e.ganadores.slice().sort(), [ids[0], ids[1]].sort());
  assert.deepStrictEqual(puestos(e), { 1: 1, 2: 1, 3: 3 });
});

caso('empate por el 3.º puesto se desempata; por el 4.º no', async () => {
  const t3 = await terminada([10000, 11000, 12000, 12003]);
  assert.strictEqual(t3.e.desempate.estado, 'iniciar');
  assert.strictEqual(t3.e.desempate.posicion, 3);
  const t4 = await terminada([10000, 11000, 12000, 13000, 13004]);
  assert.strictEqual(t4.e.desempate.estado, null);
  assert.deepStrictEqual(t4.e.ganadores, [t4.ids[0]]);
  assert.deepStrictEqual(puestos(t4.e), { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 });
});

caso('dos empates en la misma carrera (1.º y 3.º): uno por vez', async () => {
  const { id, ids, e } = await terminada([10000, 10004, 12000, 12002]);
  assert.strictEqual(e.desempate.posicion, 1);
  await iniciarDes(id);
  await llegarDes(id, ids[0]);
  const medio = await llegarDes(id, ids[1]);
  assert.strictEqual(medio.desempate.estado, 'iniciar');
  assert.strictEqual(medio.desempate.posicion, 3);
  assert.deepStrictEqual(medio.ganadores, []); // todavía no hay ganador definitivo
  await iniciarDes(id);
  await llegarDes(id, ids[2]);
  const fin = await llegarDes(id, ids[3]);
  assert.strictEqual(fin.desempate.estado, null);
  assert.deepStrictEqual(fin.ganadores, [ids[0]]);
  assert.deepStrictEqual(puestos(fin), { 1: 1, 2: 2, 3: 3, 4: 4 });
});

caso('eliminar: reglas y puestos que se mantienen', async () => {
  const antes = await nueva(2);
  await largar(antes.id);
  await falla('POST', ruta(antes.id, antes.ids[0], 'eliminar'), 409); // carrera sin terminar
  const { id, ids } = await terminada([10000, 11000, 12000]);
  await falla('POST', ruta(id, ids[0], 'eliminar'), 409); // es el ganador
  const e = await bien('POST', ruta(id, ids[2], 'eliminar'));
  assert.strictEqual(e.competidores.find((c) => c.id === ids[2]).eliminado, 1);
  assert.strictEqual(e.competidores.find((c) => c.id === ids[1]).posicion, 2);
  assert.deepStrictEqual(e.ganadores, [ids[0]]);
});

const deshacer = (id, cid) => bien('POST', ruta(id, cid, 'deshacer'));

caso('deshacer: corrige una llegada y reabre la carrera terminada', async () => {
  const { id, ids } = await nueva(2);
  await largar(id);
  await llegar(id, ids[0]);
  const fin = await llegar(id, ids[1]);
  assert.strictEqual(fin.carrera.estado, 'finalizada');
  const e = await deshacer(id, ids[0]);
  assert.strictEqual(e.carrera.estado, 'en_curso');
  assert.strictEqual(e.carrera.fin_ms, null);
  const c0 = e.competidores.find((c) => c.id === ids[0]);
  assert.ok(c0.estado === 'en_carrera' && c0.tiempo_ms === null);
  assert.deepStrictEqual(e.ganadores, []);
  await falla('POST', ruta(id, ids[0], 'deshacer'), 409); // ya está en pista
  const otra = await llegar(id, ids[0]);
  assert.strictEqual(otra.carrera.estado, 'finalizada');
  assert.deepStrictEqual(otra.ganadores, [ids[1]]);
});

caso('deshacer un incidente y sus límites (sin largar, con desempate largado)', async () => {
  const antes = await nueva(2);
  await falla('POST', ruta(antes.id, antes.ids[0], 'deshacer'), 409); // no largó
  const { id, ids } = await nueva(3);
  await largar(id);
  await incidente(id, ids[0]);
  const e = await deshacer(id, ids[0]);
  assert.strictEqual(e.competidores.find((c) => c.id === ids[0]).estado, 'en_carrera');
  // Con un empate pendiente (desempate sin largar) todavía se puede deshacer; con el desempate largado, no.
  const t = await terminada([12000, 12005, 15000]);
  assert.strictEqual(t.e.desempate.estado, 'iniciar');
  const reabierta = await deshacer(t.id, t.ids[2]);
  assert.strictEqual(reabierta.carrera.estado, 'en_curso');
  await llegar(t.id, t.ids[2]);
  await iniciarDes(t.id);
  await falla('POST', ruta(t.id, t.ids[0], 'deshacer'), 409);
});

caso('proyector: devuelve la carrera más reciente y sirve la página', async () => {
  const c = await bien('POST', '/api/carreras', { nombre: 'TEST proyector', cupo: 2 });
  const actual = await bien('GET', '/api/carreras/actual');
  assert.strictEqual(actual.carrera.id, c.carrera.id);
  assert.ok(typeof actual.ahora_ms === 'number'); // el proyector la usa para sincronizar el reloj
  const r = await fetch(BASE + '/proyector');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('Posiciones'));
});

(async () => {
  let fallas = 0;
  for (const [nombre, fn] of casos) {
    try {
      await fn();
      console.log('✔ ' + nombre);
    } catch (e) {
      fallas++;
      console.log('✘ ' + nombre + '\n    ' + e.message);
    }
  }
  await pool.query("DELETE FROM carreras WHERE nombre LIKE 'TEST %'");
  await pool.end();
  console.log(fallas ? '\n' + fallas + ' prueba(s) fallaron' : '\nTodas las pruebas pasaron');
  process.exit(fallas ? 1 : 0);
})();
