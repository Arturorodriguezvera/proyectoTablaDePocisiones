'use strict';
// Sonido de la cuenta regresiva: un pitido en cada número (3, 2, 1) y uno más largo y agudo en el "ya".
// Lo usan la pantalla de control y el proyector. Los pitidos se generan con Web Audio: no hay archivos de audio.
//
// Se programan con el reloj de audio a partir de la hora de largada del servidor (la misma que usa el reloj en
// pantalla), así suenan parejos con los números aunque la pantalla se redibuje un poco tarde. Los cuatro pitidos
// se programan juntos apenas la ventana se entera de la largada; si se entera tarde (el proyector consulta cada
// medio segundo), el pitido del número que ya se está viendo suena enseguida y los siguientes salen a su hora.
//
// Reglas de los navegadores y de este módulo:
// - No suena hasta que alguien toca la ventana una vez (cualquier clic o tecla la habilita).
// - Si las dos ventanas están en la misma compu y las dos están habilitadas, suena solo una (la primera que se
//   entera de la largada, normalmente el control), para que no se oiga doble.
const Sonido = (() => {
  const VOLUMEN = 0.2;        // de 0 a 1
  const FREC_NUMERO = 880;    // pitido del 3, 2 y 1
  const FREC_YA = 1320;       // pitido del "ya": más agudo y más largo
  const TARDE_MAX_MS = 500;   // un pitido que se perdió por más que esto ya no suena
  const programados = new Set(); // "inicio:3", "inicio:2", "inicio:1", "inicio:ya": se programan una sola vez
  const propios = new Set();     // largadas que esta ventana hace sonar
  const ajenos = new Set();      // largadas que ya hace sonar otra ventana
  let ctx = null;

  const listo = () => ctx !== null && ctx.state === 'running';

  // Crea (o reanuda) el audio. Hay que llamarlo desde un clic o una tecla. Devuelve una promesa.
  function desbloquear() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return Promise.resolve();
      try { ctx = new AC(); } catch (e) { return Promise.resolve(); }
    }
    if (ctx.state === 'running') return Promise.resolve();
    return Promise.resolve(ctx.resume()).catch(() => {});
  }

  // Marca esta largada como "la hago sonar yo". Devuelve false si otra ventana de esta compu ya la reclamó.
  function reclamar(inicioMs) {
    const clave = String(inicioMs);
    if (propios.has(clave)) return true;
    if (ajenos.has(clave)) return false;
    try {
      if (localStorage.getItem('sonidoLargada') === clave) { ajenos.add(clave); return false; }
      localStorage.setItem('sonidoLargada', clave);
    } catch (e) { /* sin almacenamiento: suena igual */ }
    propios.add(clave);
    return true;
  }

  function pitido(cuando, frecuencia, duracion) {
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frecuencia;
    gan.gain.setValueAtTime(0.0001, cuando);
    gan.gain.exponentialRampToValueAtTime(VOLUMEN, cuando + 0.01);
    gan.gain.exponentialRampToValueAtTime(0.0001, cuando + duracion);
    osc.connect(gan);
    gan.connect(ctx.destination);
    osc.start(cuando);
    osc.stop(cuando + duracion + 0.02);
  }

  // inicioMs: hora de largada del servidor. desfase: hora del servidor menos la de esta compu.
  // Se puede llamar todas las veces que haga falta (cada cuadro, cada consulta): cada pitido se programa una vez.
  function programar(inicioMs, desfase) {
    if (!listo()) return;
    const ahora = Date.now() + desfase;   // hora del servidor en este momento
    const falta = inicioMs - ahora;       // ms hasta el "ya" (negativo si ya pasó)
    if (falta <= -TARDE_MAX_MS) return;   // la cuenta ya terminó
    if (!reclamar(inicioMs)) return;
    const base = ctx.currentTime;
    const poner = (clave, horaMs, frecuencia, duracion) => {
      if (programados.has(clave)) return;
      programados.add(clave);
      if (ahora - horaMs > TARDE_MAX_MS) return; // se perdió: mejor callar que sonar fuera de tiempo
      pitido(base + Math.max(0, (horaMs - ahora) / 1000), frecuencia, duracion);
    };
    // El número que se está viendo ahora y los que siguen hasta el 1 (el 3 es el primero de la cuenta).
    for (let n = Math.ceil(falta / 1000); n >= 1; n--) {
      poner(inicioMs + ':' + n, inicioMs - n * 1000, FREC_NUMERO, 0.2);
    }
    poner(inicioMs + ':ya', inicioMs, FREC_YA, 0.7);
  }

  // Un pitido corto para comprobar que suena y el volumen.
  function probar() {
    if (listo()) pitido(ctx.currentTime, FREC_NUMERO, 0.2);
  }

  return { desbloquear, listo, probar, programar };
})();

// Cualquier toque en la ventana habilita el sonido (regla de los navegadores).
if (typeof document !== 'undefined') {
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) =>
    document.addEventListener(ev, () => { Sonido.desbloquear(); }, { passive: true }));
}
if (typeof module !== 'undefined') module.exports = Sonido;
