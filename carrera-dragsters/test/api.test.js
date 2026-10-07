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
// Las pruebas saltean la cuenta regresiva corriendo hacia atrás la hora de largada (la prueba de la cuenta la espera de verdad).
const saltar = (id, e) => pool.query('UPDATE carreras SET inicio_ms = inicio_ms - ? WHERE id = ?', [Math.max(0, e.carrera.inicio_ms - e.ahora_ms) + 1, id]);
const largar = async (id) => {
  const e = await bien('POST', '/api/carreras/' + id + '/largada');
  await saltar(id, e);
  return e;
};
const estado = (id) => bien('GET', '/api/carreras/' + id);
const llegar = async (id, cid) => { await dormir(25); return bien('POST', ruta(id, cid, 'llegada')); };
const incidente = (id, cid) => bien('POST', ruta(id, cid, 'incidente'));
// Las pruebas saltean también la cuenta regresiva del desempate.
const iniciarDes = async (id) => {
  const e = await bien('POST', '/api/carreras/' + id + '/desempate/iniciar');
  await pool.query('UPDATE desempates SET inicio_ms = inicio_ms - ? WHERE carrera_id = ? AND posicion = ? AND ronda = ?',
    [Math.max(0, e.desempate.inicio_ms - e.ahora_ms) + 1, id, e.desempate.posicion, e.desempate.ronda]);
  return e;
};
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
  await saltar(id, largadas.find((r) => r.status === 200).body);
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

caso('cuenta regresiva: llegadas e incidentes se rechazan antes del ya', async () => {
  const { id, ids } = await nueva(3);
  const e = await bien('POST', '/api/carreras/' + id + '/largada'); // sin saltar la cuenta
  assert.ok(e.carrera.inicio_ms - e.ahora_ms > 0, 'la cuenta regresiva está desactivada (CUENTA_REGRESIVA_MS=0)');
  assert.strictEqual(e.carrera.estado, 'en_curso');
  await falla('POST', ruta(id, ids[0], 'llegada'), 409);
  await falla('POST', ruta(id, ids[1], 'incidente'), 409);
  const igual = await estado(id); // no quedó nada registrado
  assert.ok(igual.competidores.every((c) => c.estado === 'en_carrera'));
});

caso('cuenta regresiva: la llegada justo después del ya se acepta y cuenta desde el ya', async () => {
  const { id, ids } = await nueva(2);
  const e = await bien('POST', '/api/carreras/' + id + '/largada');
  const espera = e.carrera.inicio_ms - e.ahora_ms;
  assert.ok(espera > 0, 'la cuenta regresiva está desactivada (CUENTA_REGRESIVA_MS=0)');
  await dormir(espera + 50);
  const ok = await bien('POST', ruta(id, ids[0], 'llegada'));
  const tiempo = ok.competidores.find((c) => c.id === ids[0]).tiempo_ms;
  assert.ok(tiempo >= 0 && tiempo < 1500, 'el tiempo tiene que contar desde el ya: ' + tiempo);
});

caso('cuenta regresiva: repetir la carrera sigue funcionando y la nueva largada tiene su cuenta', async () => {
  const { id, ids } = await nueva(2);
  await largar(id); // salta la primera cuenta
  await incidente(id, ids[0]);
  const rep = await incidente(id, ids[1]);
  assert.strictEqual(rep.repetida, true);
  assert.strictEqual(rep.carrera.estado, 'configuracion');
  const e = await bien('POST', '/api/carreras/' + id + '/largada');
  const espera = e.carrera.inicio_ms - e.ahora_ms;
  assert.ok(espera > 0);
  await falla('POST', ruta(id, ids[0], 'llegada'), 409);
  await dormir(espera + 50);
  const fin = await bien('POST', ruta(id, ids[0], 'llegada'));
  assert.strictEqual(fin.competidores.find((c) => c.id === ids[0]).estado, 'llego');
});

caso('cuenta regresiva del desempate: llegadas e incidentes se rechazan antes del ya', async () => {
  const { id, ids } = await terminada([12000, 12005, 15000]);
  const d = await bien('POST', '/api/carreras/' + id + '/desempate/iniciar'); // sin saltar la cuenta
  const espera = d.desempate.inicio_ms - d.ahora_ms;
  assert.ok(espera > 0, 'la cuenta regresiva está desactivada (CUENTA_REGRESIVA_MS=0)');
  const base = '/api/carreras/' + id + '/desempate/';
  await falla('POST', base + ids[0] + '/llegada', 409);
  await falla('POST', base + ids[1] + '/incidente', 409);
  await falla('POST', ruta(id, ids[0], 'deshacer'), 409); // con el desempate largado no se deshace
  await dormir(espera + 50);
  const medio = await bien('POST', base + ids[1] + '/llegada');
  const tiempo = medio.desempate.participantes.find((p) => p.id === ids[1]).tiempo_ms;
  assert.ok(tiempo >= 0 && tiempo < 1500, 'el tiempo del desempate cuenta desde el ya: ' + tiempo);
  await dormir(25);
  const fin = await bien('POST', base + ids[0] + '/llegada');
  assert.strictEqual(fin.desempate.estado, null);
  assert.deepStrictEqual(fin.ganadores, [ids[1]]);
});

caso('deshacer con la cuenta regresiva activa no rompe nada', async () => {
  const { id, ids } = await nueva(2);
  const e = await bien('POST', '/api/carreras/' + id + '/largada'); // cuenta en marcha
  const espera = e.carrera.inicio_ms - e.ahora_ms;
  assert.ok(espera > 0, 'la cuenta regresiva está desactivada (CUENTA_REGRESIVA_MS=0)');
  await falla('POST', ruta(id, ids[0], 'deshacer'), 409); // todos siguen en pista
  const igual = await estado(id);
  assert.strictEqual(igual.carrera.estado, 'en_curso');
  assert.strictEqual(igual.carrera.inicio_ms, e.carrera.inicio_ms); // la hora de largada no se movió
  await dormir(espera + 50);
  await bien('POST', ruta(id, ids[0], 'llegada'));
  const fin = await bien('POST', ruta(id, ids[1], 'llegada'));
  assert.strictEqual(fin.carrera.estado, 'finalizada');
  // Deshacer una llegada reabre la carrera SIN nueva cuenta regresiva: el reloj sigue desde la largada original.
  const reabierta = await deshacer(id, ids[1]);
  assert.strictEqual(reabierta.carrera.estado, 'en_curso');
  assert.strictEqual(reabierta.carrera.inicio_ms, e.carrera.inicio_ms);
  assert.ok(reabierta.carrera.inicio_ms < reabierta.ahora_ms);
});

caso('historial: lista las carreras (la más nueva primero) con su ganador y sirve la página', async () => {
  const { id, ids } = await nueva(2);
  await largar(id);
  await llegar(id, ids[0]);
  await llegar(id, ids[1]);
  const lista = await bien('GET', '/api/carreras');
  const mia = lista.find((c) => c.id === id);
  assert.ok(mia, 'la carrera terminada tiene que estar en el historial');
  assert.strictEqual(mia.estado, 'finalizada');
  assert.deepStrictEqual(mia.ganadores, ['P1']);
  assert.ok(mia.fin_ms >= mia.inicio_ms);
  const nueva2 = await bien('POST', '/api/carreras', { nombre: 'TEST historial sin largar', cupo: 2 });
  const lista2 = await bien('GET', '/api/carreras');
  assert.strictEqual(lista2[0].id, nueva2.carrera.id); // la más nueva primero
  assert.strictEqual(lista2[0].estado, 'configuracion');
  assert.deepStrictEqual(lista2[0].ganadores, []);
  const r = await fetch(BASE + '/historial');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('Historial de carreras'));
});

caso('editar: corrige nombre y número, valida y no deja repetir números', async () => {
  const { id, ids } = await nueva(3); // P1/1, P2/2, P3/3
  const url = (cid) => '/api/carreras/' + id + '/competidores/' + cid;
  // Cambia nombre y número (se recortan los espacios) y la lista se reordena por número.
  let e = await bien('PUT', url(ids[0]), { nombre: '  Ana  ', numero: 9 });
  const ana = e.competidores.find((c) => c.id === ids[0]);
  assert.strictEqual(ana.nombre, 'Ana');
  assert.strictEqual(ana.numero, 9);
  assert.deepStrictEqual(e.competidores.map((c) => c.numero), [2, 3, 9]);
  // Cambiar solo el nombre (mismo número) vale.
  e = await bien('PUT', url(ids[1]), { nombre: 'Beto', numero: 2 });
  assert.strictEqual(e.competidores.find((c) => c.id === ids[1]).nombre, 'Beto');
  // Número repetido, datos inválidos y competidores que no existen o son de otra carrera.
  await falla('PUT', url(ids[1]), 409, { nombre: 'Beto', numero: 3 });
  await falla('PUT', url(ids[1]), 400, { nombre: '   ', numero: 2 });
  await falla('PUT', url(ids[1]), 400, { nombre: 'x'.repeat(81), numero: 2 });
  await falla('PUT', url(ids[1]), 400, { nombre: 'Beto', numero: 0 });
  await falla('PUT', url(ids[1]), 400, { nombre: 'Beto', numero: 10000 });
  await falla('PUT', url(ids[1]), 400, { nombre: 'Beto', numero: 2.5 });
  await falla('PUT', url(999999999), 404, { nombre: 'Beto', numero: 2 });
  const otra = await nueva(2);
  await falla('PUT', '/api/carreras/' + otra.id + '/competidores/' + ids[1], 404, { nombre: 'Beto', numero: 2 });
  // Lo rechazado no cambió nada.
  e = await estado(id);
  assert.deepStrictEqual(e.competidores.map((c) => [c.nombre, c.numero]), [['Beto', 2], ['P3', 3], ['Ana', 9]]);
});

caso('editar: se puede con la carrera en curso y terminada, sin cambiar tiempos ni puestos', async () => {
  const { id, ids } = await nueva(3);
  const url = (cid) => '/api/carreras/' + id + '/competidores/' + cid;
  await largar(id);
  await llegar(id, ids[1]);
  // En curso: corrige a uno que sigue en pista.
  let e = await bien('PUT', url(ids[0]), { nombre: 'Ana', numero: 11 });
  assert.strictEqual(e.carrera.estado, 'en_curso');
  assert.strictEqual(e.competidores.find((c) => c.id === ids[0]).estado, 'en_carrera');
  await llegar(id, ids[0]);
  await incidente(id, ids[2]);
  const antes = await estado(id);
  assert.strictEqual(antes.carrera.estado, 'finalizada');
  // Terminada: corrige al que llegó primero y al del incidente.
  await bien('PUT', url(ids[1]), { nombre: 'Beto', numero: 22 });
  e = await bien('PUT', url(ids[2]), { nombre: 'Cami', numero: 33 });
  const por = (cid) => e.competidores.find((c) => c.id === cid);
  assert.strictEqual(por(ids[1]).nombre, 'Beto');
  assert.strictEqual(por(ids[1]).numero, 22);
  assert.strictEqual(por(ids[2]).estado, 'incidente');
  assert.strictEqual(por(ids[1]).tiempo_ms, antes.competidores.find((c) => c.id === ids[1]).tiempo_ms);
  assert.strictEqual(por(ids[1]).posicion, 1);
  assert.strictEqual(por(ids[0]).posicion, 2);
  assert.deepStrictEqual(e.ganadores, [ids[1]]);
  assert.strictEqual(e.carrera.estado, 'finalizada');
  // El proyector y el historial muestran el nombre corregido.
  const actual = await bien('GET', '/api/carreras/actual');
  assert.ok(actual.competidores.some((c) => c.nombre === 'Beto' && c.numero === 22));
  const lista = await bien('GET', '/api/carreras');
  assert.deepStrictEqual(lista.find((c) => c.id === id).ganadores, ['Beto']);
  // Un competidor eliminado de la tabla final ya no se edita.
  await bien('POST', ruta(id, ids[0], 'eliminar'));
  await falla('PUT', url(ids[0]), 404, { nombre: 'Ana', numero: 11 });
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
