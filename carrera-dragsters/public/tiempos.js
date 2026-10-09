'use strict';
// Diferencia de tiempo con el 1.º (etapa 19). Lo usan el control, el proyector y el historial, así se ve igual en las tres.
//
// Uso:
//   const ref = Tiempos.referencia(llegaron);                 // tiempo del 1.º (o null si todavía no llegó nadie)
//   Tiempos.diferencia(competidor, ref);                      // '+0.35 s' (null si es el 1.º o no hay referencia)
//   Tiempos.celda(formato(c.tiempo_ms), dif, clasesT, clasesD, Tiempos.esMejor(c, e.mejor_tiempo_ms))
//                                                              // tiempo arriba y, abajo, la diferencia y/o "Mejor tiempo"
//
// Etapa 20: el mejor tiempo de todas las carreras guardadas (lo manda el servidor como mejor_tiempo_ms) se destaca en
// violeta, como el mejor tiempo en la Fórmula 1.
const Tiempos = (() => {
  const MORADO = '#6D28D9'; // se lee bien sobre blanco y sobre el amarillo del ganador
  // Los tiempos se muestran truncados a la centésima (igual que formato() de cada pantalla). La diferencia se calcula con
  // esas mismas centésimas, así siempre coincide con la resta de los dos tiempos que se ven en pantalla.
  const centesimas = (ms) => Math.floor(ms / 10);

  // Tiempo del que va primero entre los que llegaron (los de posición 1: si empatan, tienen el mismo tiempo). null si nadie llegó.
  function referencia(llegaron) {
    const primeros = llegaron.filter((x) => x.posicion === 1 && x.tiempo_ms !== null && x.tiempo_ms !== undefined);
    const lista = primeros.length ? primeros : llegaron.filter((x) => x.tiempo_ms !== null && x.tiempo_ms !== undefined);
    if (!lista.length) return null;
    return Math.min(...lista.map((x) => x.tiempo_ms));
  }

  // '+0.35 s', '+12.34 s' o, a partir del minuto, '+1:05.20'. Sin diferencia para el 1.º (posición 1) ni sin referencia.
  function diferencia(x, referenciaMs) {
    if (referenciaMs === null || referenciaMs === undefined || x.posicion === 1) return null;
    if (x.tiempo_ms === null || x.tiempo_ms === undefined) return null;
    const cent = Math.max(0, centesimas(x.tiempo_ms) - centesimas(referenciaMs));
    const dos = (n) => String(n).padStart(2, '0');
    if (cent < 6000) return '+' + Math.floor(cent / 100) + '.' + dos(cent % 100) + ' s';
    return '+' + Math.floor(cent / 6000) + ':' + dos(Math.floor(cent / 100) % 60) + '.' + dos(cent % 100);
  }

  // ¿Es este competidor el dueño del mejor tiempo? Se compara con las mismas centésimas que se ven en pantalla, así que
  // si dos tienen el mismo tiempo a la centésima, los dos se destacan.
  function esMejor(x, mejorMs) {
    if (mejorMs === null || mejorMs === undefined || x.tiempo_ms === null || x.tiempo_ms === undefined) return false;
    return centesimas(x.tiempo_ms) <= centesimas(mejorMs);
  }

  // Celda para una fila: el tiempo arriba (en violeta si es el mejor) y abajo, más chico, "Mejor tiempo" y/o la diferencia con el 1.º.
  function celda(tiempoTexto, difTexto, clasesTiempo, clasesDif, mejor) {
    const caja = document.createElement('div');
    caja.className = 'flex flex-col items-end leading-tight';
    const t = document.createElement('span');
    t.className = clasesTiempo;
    t.textContent = tiempoTexto;
    if (mejor) t.style.color = MORADO;
    caja.appendChild(t);
    if (mejor) caja.appendChild(etiquetaMejor(clasesDif));
    if (difTexto) caja.appendChild(etiquetaDiferencia(difTexto, clasesDif));
    return caja;
  }

  // Cartelito "Mejor tiempo": letra y borde violeta, sin fondo, para que se vea también al imprimir.
  function etiquetaMejor(clases) {
    const m = document.createElement('span');
    m.className = clases;
    m.textContent = 'Mejor tiempo';
    m.title = 'Mejor tiempo de todas las carreras';
    m.setAttribute('aria-label', 'Mejor tiempo de todas las carreras');
    m.style.color = MORADO;
    m.style.border = '2px solid ' + MORADO;
    m.style.borderRadius = '0.375rem';
    m.style.padding = '0 0.4em';
    m.style.fontWeight = '700';
    return m;
  }

  // La diferencia suelta (la usa el podio, que ya apila sus datos en columna).
  function etiquetaDiferencia(difTexto, clases) {
    const d = document.createElement('span');
    d.className = clases;
    d.textContent = difTexto;
    d.title = 'Diferencia con el 1.º';
    d.setAttribute('aria-label', 'A ' + difTexto.slice(1) + ' del primero');
    return d;
  }

  return { MORADO, referencia, diferencia, esMejor, celda, etiquetaDiferencia, etiquetaMejor };
})();

if (typeof module !== 'undefined') module.exports = Tiempos;
