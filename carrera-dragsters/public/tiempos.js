'use strict';
// Diferencia de tiempo con el 1.º (etapa 19). Lo usan el control, el proyector y el historial, así se ve igual en las tres.
//
// Uso:
//   const ref = Tiempos.referencia(llegaron);                 // tiempo del 1.º (o null si todavía no llegó nadie)
//   Tiempos.diferencia(competidor, ref);                      // '+0.35 s' (null si es el 1.º o no hay referencia)
//   Tiempos.celda(formato(c.tiempo_ms), dif, clasesT, clasesD) // tiempo arriba y diferencia abajo, para una fila
const Tiempos = (() => {
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

  // Celda para una fila: el tiempo arriba y, si hay, la diferencia con el 1.º abajo y más chica.
  function celda(tiempoTexto, difTexto, clasesTiempo, clasesDif) {
    const caja = document.createElement('div');
    caja.className = 'flex flex-col items-end leading-tight';
    const t = document.createElement('span');
    t.className = clasesTiempo;
    t.textContent = tiempoTexto;
    caja.appendChild(t);
    if (difTexto) caja.appendChild(etiquetaDiferencia(difTexto, clasesDif));
    return caja;
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

  return { referencia, diferencia, celda, etiquetaDiferencia };
})();

if (typeof module !== 'undefined') module.exports = Tiempos;
