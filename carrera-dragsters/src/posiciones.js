'use strict';
// Puestos, empates y desempates. Lógica pura: filas de la base y devuelve los puestos.
//
// Tener en cuenta:
// - Dos tiempos empatan si coinciden a la centésima de segundo.
// - Si el empate ocupa el 1.º, 2.º o 3.º puesto, los empatados corren de nuevo solos (desempate).
// - Máximo 3 intentos por empate. Si siguen empatados, comparten ese puesto.
// - Si en un desempate quedan nuevos empates, se desempatan de nuevo (mismas reglas, un grupo por vez).
// - Los que tienen incidente en un desempate quedan detrás de los que llegaron.

const MAX_RONDAS = 3;
const ULTIMO_PUESTO_CON_DESEMPATE = 3;
const centi = (ms) => Math.floor(ms / 10);
const porTiempo = (a, b) => a.tiempo_ms - b.tiempo_ms;

// Agrupa una lista ya ordenada por tiempo: los que tienen la misma centésima van juntos.
function agrupar(lista) {
  const grupos = [];
  lista.forEach((x) => {
    const g = grupos[grupos.length - 1];
    if (g && centi(g[0].tiempo_ms) === centi(x.tiempo_ms)) g.push(x);
    else grupos.push([x]);
  });
  return grupos;
}

function calcular(carrera, competidores, desempates, partes) {
  const puestos = new Map();
  const porId = new Map(competidores.map((c) => [c.id, c]));
  let pendiente = null;

  // Ubica a un grupo empatado que ocupa desde el puesto p. `ronda` es el próximo intento.
  function resolver(grupo, p, ronda) {
    const sinDesempate = grupo.length === 1 || p > ULTIMO_PUESTO_CON_DESEMPATE ||
      ronda > MAX_RONDAS || carrera.estado !== 'finalizada';
    if (sinDesempate) {
      grupo.forEach((c) => puestos.set(c.id, p));
      return;
    }
    const d = desempates.find((x) => x.posicion === p && x.ronda === ronda);
    const ps = d ? partes.filter((x) => x.desempate_id === d.id) : [];
    if (!d || ps.some((x) => x.estado === 'en_carrera')) {
      grupo.forEach((c) => puestos.set(c.id, p)); // puesto provisional
      if (!pendiente) {
        pendiente = { estado: d ? 'en_curso' : 'iniciar', posicion: p, ronda, desempate: d || null, ids: grupo.map((c) => c.id) };
      }
      return;
    }
    let siguiente = p;
    agrupar(ps.filter((x) => x.estado === 'llego').sort(porTiempo)).forEach((sub) => {
      resolver(sub.map((x) => porId.get(x.competidor_id)), siguiente, ronda + 1);
      siguiente += sub.length;
    });
    ps.filter((x) => x.estado === 'incidente').forEach((x) => puestos.set(x.competidor_id, siguiente));
  }

  let p = 1;
  agrupar(competidores.filter((c) => c.estado === 'llego').sort(porTiempo)).forEach((g) => {
    resolver(g, p, 1);
    p += g.length;
  });
  return { puestos, pendiente };
}

module.exports = { MAX_RONDAS, calcular };
