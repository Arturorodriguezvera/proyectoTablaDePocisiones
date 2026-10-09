'use strict';
// Árbol de luces de la cuenta regresiva, como en las carreras de arrancones: tres luces ámbar que se prenden de a una
// (con el 3, el 2 y el 1) y una verde que se prende en el ¡YA! (en ese momento las ámbar se apagan).
// Lo usan la pantalla de control y el proyector, así la largada se ve igual en las dos.
//
// Uso: const arbol = Arbol.crear('9vh'); contenedor.appendChild(arbol);
//      Arbol.actualizar(arbol, '3');  // también '2', '1', '¡YA!' o null para esconderlo
const Arbol = (() => {
  const AMBAR = '#FFB300';
  const VERDE = '#22C55E';
  const APAGADA = '#2B3F5C'; // se ve sobre el fondo azul oscuro del control y del proyector

  // Qué luces van prendidas para el texto de la cuenta. Con 3 → 1 ámbar, con 2 → 2, con 1 → 3 (antes del 3, ninguna).
  function luces(texto) {
    if (texto === '¡YA!') return { ambar: 0, verde: true };
    const n = Number(texto);
    if (texto === null || texto === undefined || texto === '' || !Number.isInteger(n) || n < 1) return { ambar: 0, verde: false };
    return { ambar: Math.max(0, Math.min(3, 4 - n)), verde: false };
  }

  // tamano: tamaño de cada luz (cualquier medida CSS, por ejemplo '9vh' o '2.5rem'). alinear: cómo se alinean las
  // luces dentro de su caja ('center' por omisión). Nace escondido: se muestra con actualizar().
  function crear(tamano, alinear) {
    const caja = document.createElement('div');
    caja.setAttribute('aria-hidden', 'true'); // es decorativo: el número ya se lee en pantalla
    caja.style.display = 'none';
    caja.style.alignItems = 'center';
    caja.style.justifyContent = alinear || 'center';
    caja.style.fontSize = tamano; // las medidas de adentro van en em: todo crece con el tamaño
    caja.style.gap = '0.4em';
    for (let i = 0; i < 4; i++) { // 3 ámbar y 1 verde
      const luz = document.createElement('span');
      luz.style.display = 'block';
      luz.style.width = '1em';
      luz.style.height = '1em';
      luz.style.flexShrink = '0';
      luz.style.boxSizing = 'border-box';
      luz.style.borderRadius = '50%';
      luz.style.border = '0.07em solid rgba(255, 255, 255, 0.35)';
      luz.style.background = APAGADA;
      caja.appendChild(luz);
    }
    return caja;
  }

  // Pinta el árbol según el texto de la cuenta; con null lo esconde. Si el texto no cambió, no toca nada.
  function actualizar(caja, texto) {
    const visible = texto !== null && texto !== undefined;
    const clave = visible ? String(texto) : '';
    if (caja._texto === clave) return;
    caja._texto = clave;
    caja.style.display = visible ? 'flex' : 'none';
    const { ambar, verde } = luces(texto);
    Array.from(caja.childNodes).forEach((luz, i) => {
      const prendida = i < 3 ? i < ambar : verde;
      const color = i < 3 ? AMBAR : VERDE;
      luz.style.background = prendida ? color : APAGADA;
      luz.style.boxShadow = prendida ? '0 0 0.7em ' + color : 'none';
    });
  }

  return { crear, actualizar, luces };
})();

if (typeof module !== 'undefined') module.exports = Arbol;
