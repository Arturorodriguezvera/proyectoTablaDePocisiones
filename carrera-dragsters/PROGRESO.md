# Carreras de dragsters escolares: estado del proyecto

## Stack y decisiones
- Backend: Node.js + Express. Base de datos: MySQL. Frontend: JavaScript + Tailwind CSS.
- Dos ventanas: control (`/`) y proyector (`/proyector`), sincronizadas por consulta cada medio segundo (sin WebSockets).
- Cronometraje manual: botón "Llegó" por competidor. Más adelante se reemplaza por un sensor sin tocar el resto.
- Empates: si dos o más competidores empatan en cualquiera de los primeros 3 puestos, corren de nuevo
  solo los empatados (desempate). Máximo 3 intentos; si siguen empatados, todos quedan con ese puesto.
- La largada solo se habilita con el cupo completo.
- **Si todos los competidores tienen incidente, la carrera se repite con los mismos participantes.** La carrera vuelve a "lista para largar" (hay que apretar Largar de nuevo), se borran tiempos, desempates y eliminaciones, y la pantalla muestra un aviso. Vale también si el último incidente se marca después de terminada la carrera. No cambia la base.
  - Si todos los participantes de un **desempate** tienen incidente, no se repite: siguen empatados y comparten el puesto (regla anterior sin cambios).
- Eliminación manual de competidores de la tabla final, después de determinar al ganador.

## Etapas
- [x] **Etapa 1: Base y estructura.** Proyecto Node + Express, MySQL, tablas `carreras` y `competidores`.
- [x] **Etapa 2: Configuración y registro.** Pantalla en `http://localhost:3000` para definir el cupo y cargar competidores (nombre + número), sin números repetidos y sin pasar el cupo. Se puede quitar un competidor antes de largar. La carrera en curso se recuerda al recargar la página.
- [x] **Etapa 3: Largada y cronómetro.** Botón "Largar" (solo con el cupo completo) y cronómetro global en pantalla (minutos:segundos.centésimas). Al largar desaparecen el formulario y los botones "Quitar".
  - La hora de largada la guarda el servidor (`inicio_ms`) y el cronómetro se calcula con ese dato, así que sigue bien si se recarga la página.
  - Ruta nueva: `POST /api/carreras/:id/largada`. No cambia la base: no hace falta volver a cargar `schema.sql`.
  - Todavía no se puede detener la carrera ni marcar llegadas (etapa 4). Para probar de nuevo, usar "Empezar una carrera nueva".
  - Falta probarla en el navegador: llenar el cupo, largar, recargar la página y ver que el reloj sigue.
- [x] **Etapa 4: Llegadas, incidentes y tabla en vivo.** Después de largar aparecen tres bloques: "En pista" (botones Llegó e Incidente por competidor), "Posiciones" (ordenadas por tiempo, se actualiza con cada acción) e "Incidentes".
  - "Llegó" guarda el tiempo con el reloj del servidor. Un incidente se puede marcar durante la carrera o después de terminada (pide confirmación y borra el tiempo).
  - Cuando ya nadie queda en pista, la carrera pasa sola a "terminada" y el reloj queda con el tiempo total.
  - Rutas nuevas: `POST /api/carreras/:id/competidores/:cid/llegada` y `.../incidente`. No cambia la base: no hace falta volver a cargar `schema.sql`.
  - Los tiempos iguales a la centésima comparten puesto; el desempate llega en la etapa 5.
  - Falta probarla en el navegador: carrera con cupo 3, un "Llegó", un "Incidente", un "Llegó", y ver que se frena el reloj.
- [x] **Etapa 5: Empates y desempate.** Cuando la carrera termina y hay empate en el 1.º, 2.º o 3.º puesto, aparece un panel "Empate por el N.º puesto" con el botón "Largar desempate". Corren solo los empatados, con el reloj del desempate en pantalla, y se marca "Llegó" o "Incidente" a cada uno.
  - **Cambia la base:** hay que correr `database/etapa-5.sql` una vez (crea `desempates` y `desempate_participantes`). `schema.sql` ya las trae para instalaciones nuevas.
  - Lógica en `src/posiciones.js`: máximo 3 intentos por empate; si siguen empatados, comparten el puesto. Si en un desempate quedan nuevos empates dentro del top 3, se desempatan también (de a un grupo por vez). Los que tienen incidente en un desempate quedan detrás de los que llegaron.
  - Empates en el 4.º puesto o más abajo solo comparten puesto, sin desempate.
  - Después de largar un desempate ya no se pueden marcar incidentes de la carrera principal.
  - Rutas nuevas: `POST /api/carreras/:id/desempate/iniciar`, `.../desempate/:cid/llegada` y `.../desempate/:cid/incidente`.
  - Sin la prueba automática todavía: para probar sin esperar un empate real, usar `database/probar-empate.sql` (fuerza dos tiempos iguales en la última carrera) y recargar la página.
  - Falta probarla en el navegador: empate en el 1.º, empate en el 3.º, desempate que vuelve a empatar (hasta el 3.er intento) y desempate con incidente.
- [x] **Etapa 6: Ganador y gestión final.** Cuando la carrera terminó y no queda ningún desempate, la ficha del 1.er puesto se resalta en amarillo con un zoom animado (una sola vez) y queda marcada como "Ganador" (o "Empate en 1.º" si siguen empatados tras los 3 intentos). El resto de la tabla se atenúa. Los botones "Eliminar" sacan a un competidor de la tabla final.
  - No cambia la base: no hace falta correr ningún SQL (la columna `eliminado` ya existía desde la etapa 1).
  - Ruta nueva: `POST /api/carreras/:id/competidores/:cid/eliminar`. Solo con la carrera terminada y sin desempate pendiente. No deja eliminar al ganador.
  - Al eliminar a alguien, los demás conservan su puesto (no se corren los números). Supuesto a confirmar.
  - Se puede eliminar tanto a los que llegaron como a los que tuvieron incidente. Eliminar no se puede deshacer desde la pantalla.
  - El zoom respeta la opción "reducir movimiento" del sistema (queda el resaltado fijo, sin animación).
  - Falta probarla en el navegador: terminar una carrera, ver el zoom en el 1.º, eliminar a otro y recargar la página; probar también con un empate final.
- [x] **Etapa 7: Pruebas y pulido.**
  - **Pruebas de la API** (`npm run probar`, con el servidor prendido): 12 casos contra una base real, todos pasan. Cubren cupo y números repetidos, largada incompleta, carrera normal, todos con incidente (la carrera se repite), un solo corredor que llega, doble clic (largada, llegada y altas simultáneas), empate por el 1.º, empate por el 3.º, empate en el 4.º (sin desempate), desempate con incidente, tres intentos empatados, dos empates en una misma carrera, y reglas de eliminación. Crea carreras "TEST ..." y las borra al terminar.
  - **Diseño para proyectar:** durante la carrera la pantalla se ensancha y muestra En pista / Incidentes a la izquierda y Posiciones a la derecha (en pantallas anchas); reloj más grande; letra más grande en pantallas de 1280 px o más.
  - Lo que NO está probado: la pantalla en el navegador (botones, animación del ganador, diseño). Falta hacer el recorrido a mano y ajustar lo que se vea mal en el proyector real.
- [x] **Etapa 8: Deshacer llegadas e incidentes. (Hecha: ver notas abajo.)** Botón "Deshacer" en Posiciones e Incidentes que devuelve al competidor a "En pista" (con confirmación). Si la carrera ya había terminado, se reabre y el reloj sigue. Solo hasta que se largue un desempate. Sin cambios en la base.
  - Botón "Deshacer" (con confirmación) en las filas de Posiciones y de Incidentes: devuelve al competidor a "En pista" y le borra el tiempo o el incidente. Si la carrera ya había terminado, se reabre (`en_curso`) y el reloj sigue contando desde la largada.
  - Ruta nueva: `POST /api/carreras/:id/competidores/:cid/deshacer`. No cambia la base.
  - Se puede deshacer aunque haya un empate pendiente (desempate todavía sin largar), por si el empate vino de un error. Desde que se larga un desempate ya no se puede.
  - No se puede deshacer a un competidor eliminado.
  - Pruebas: 14 casos en `npm run probar`, todos pasan (se sumaron 2 para deshacer). La pantalla en el navegador sigue sin probarse.
- [x] **Etapa 9: Vista de proyector. (Hecha: ver notas abajo.)** Página aparte (`/proyector`) con solo el reloj y las posiciones, sin botones, que se actualiza sola (consulta al servidor cada 1 segundo). Se controla desde una ventana y se proyecta la otra. Cambia la decisión de "una sola pantalla". Sin cambios en la base.
  - Página nueva `public/proyector.html` (se abre en `http://localhost:3000/proyector`, también con el enlace "Abrir vista de proyector" de la pantalla de control). Muestra el reloj grande, el estado de la carrera y las posiciones, sin botones. El zoom del ganador se ve una sola vez.
  - Muestra siempre la **carrera más reciente**: ruta nueva `GET /api/carreras/actual`. Consulta al servidor cada medio segundo (desde 10c); el reloj se dibuja continuo con la hora del servidor. Si se corta la conexión, avisa "Sin conexión con el servidor" y sigue con lo último que vio.
  - Todo se mide en rem y el tamaño de letra crece con el ancho de la pantalla (entre 16 y 30 px), para proyectores de distinta resolución.
  - No cambia la base. Pruebas: 15 casos en `npm run probar`, todos pasan (se sumó 1 para el proyector). La página del proyector en el navegador no se probó.
- [ ] **Etapa 10: Cuenta regresiva de largada** (dividida en partes; las pantallas se hacen en 10b y 10c):
  - [x] **10a: Servidor.** `POST /api/carreras/:id/largada` deja `inicio_ms` 3 segundos en el futuro (`ahora + 3000`). Hasta ese momento, llegadas e incidentes se rechazan con 409 ("Todavía no largó: esperá el ¡ya!"). Los tiempos cuentan desde el "ya". Repetir la carrera sigue funcionando y cada nueva largada tiene su propia cuenta.
    - La duración se cambia con `CUENTA_REGRESIVA_MS` en el `.env` (por defecto 3000; 0 la desactiva). No hace falta tocar el `.env` para que ande.
    - Las pantallas no cambian: el reloj marca 00:00.00 durante 3 segundos y después arranca. Si se aprieta Llegó o Incidente en ese lapso aparece el cartel de error (en 10b los botones quedan deshabilitados).
    - No cambia la base. Pruebas: 18 casos en `npm run probar`, todos pasan (3 nuevos: llegada e incidente antes del "ya" rechazados, llegada justo después aceptada con tiempo contado desde el "ya", y repetir carrera con nueva cuenta). Esta parte hace que `npm run probar` tarde unos segundos más, porque espera las cuentas regresivas.
  - [x] **10b: Pantalla de control.** Al largar se ve 3, 2, 1 en el reloj grande y el estado dice "Preparados..."; en el "ya" aparece ¡YA! un instante (0,7 s) y después el reloj cuenta el tiempo. Los botones Llegó e Incidente de "En pista" quedan deshabilitados hasta el "ya". La hora sale del servidor, así que recargar la página en medio de la cuenta la retoma donde estaba.
    - Solo cambia `public/index.html`. No cambia el servidor ni la base.
    - El proyector sigue con el reloj en 00:00.00 durante la cuenta (10c) y los desempates siguen sin cuenta regresiva (10d).
    - Falta probarla en el navegador: largar, ver 3-2-1-¡YA!, comprobar los botones deshabilitados y recargar la página a mitad de la cuenta.
  - [x] **10c: Proyector.** Durante la cuenta, el proyector muestra el 3, 2, 1 a pantalla completa (números enormes sobre fondo azul oscuro) y en el "ya" un ¡YA! amarillo de 0,7 s; después queda el reloj corriendo. Usa la misma lógica que 10b y la hora del servidor, así que ambas pantallas van parejas (la diferencia es la demora de la red, de pocos milisegundos).
    - Solo cambia `public/proyector.html`. Ahora consulta al servidor cada medio segundo (antes cada 1 segundo) para no perderse el 3 de la cuenta.
    - Los desempates siguen sin cuenta regresiva (10d).
    - Lógica del reloj probada con una pantalla simulada (3, 2, 1, ¡YA!, tiempo corriendo, desempate, carrera terminada). Falta verla en el navegador y en el proyector real.
  - [x] **10d: Desempates con cuenta regresiva.** "Largar desempate" ahora deja `inicio_ms` 3 segundos en el futuro (misma duración, `CUENTA_REGRESIVA_MS`). Hasta el "ya", llegadas e incidentes del desempate se rechazan con 409. El control y el proyector muestran el 3, 2, 1, ¡YA! también en el desempate, y los botones del desempate quedan apagados hasta el "ya".
    - Cambia el servidor, `public/index.html` y `public/proyector.html`. No cambia la base.
    - Pruebas: 20 casos en `npm run probar`, todos pasan (2 nuevos: cuenta del desempate y deshacer con la cuenta activa). El reloj del proyector se probó con una pantalla simulada también para el desempate.
  - [ ] **10e: Recorrido a mano.** La lista de chequeo está en `PRUEBA-A-MANO.md` (15 puntos: cuenta en ambas pantallas, recargar a mitad de la cuenta, deshacer, repetir carrera, desempate y proyector real). Falta hacerla; esta etapa se marca como hecha cuando salgan bien todos los puntos. No lleva código nuevo salvo que algo falle.
  - [x] **10f: Sonido de la cuenta regresiva.** Un pitido en cada número (3, 2, 1) y uno más agudo y largo en el "ya", en el control y en el proyector, también en los desempates. Los pitidos se generan en el navegador (no hay archivos de audio) y se programan con la hora de largada del servidor, así suenan parejos con los números.
    - Cambia `public/index.html` y `public/proyector.html` y se suma `public/sonido.js`. No cambia el servidor ni la base.
    - **Los navegadores no dejan sonar hasta que alguien toca la ventana una vez.** En el control alcanza con apretar Largar. Para comprobar el volumen antes de empezar hay un enlace "Probar sonido" en el encabezado del control. Si el proyector está en otra compu o navegador, hay que tocar esa ventana una vez.
    - Si el control y el proyector están en la misma compu y los dos tienen el sonido habilitado, suena **uno solo** (el primero que se entera de la largada, normalmente el control), para que no se oiga doble.
    - Si una ventana se entera tarde de la largada (el proyector consulta cada medio segundo), el pitido del número que ya se ve suena enseguida si se perdió hasta medio segundo; si se perdió más, se omite en vez de sonar fuera de tiempo. Recargar a mitad de la cuenta retoma los pitidos que faltan.
    - Probado con un audio simulado (horas de cada pitido, sin repetidos, ventana que se entera tarde, audio bloqueado, dos ventanas, reloj desfasado). Falta oírlo en el navegador real: ver los puntos 16 a 19 de `PRUEBA-A-MANO.md`.
- [x] **Etapa 11: Podio e impresión.**
  - **Pantalla de control:** cuando la carrera terminó y el ganador está definido (sin desempate pendiente) aparece el bloque "Podio": 2.º a la izquierda, 1.º al centro y 3.º a la derecha. Si hay empates, varios corredores comparten el escalón. Incluye el botón "Imprimir o guardar como PDF".
  - **Impresión / PDF:** usa la impresión del navegador (en la ventana de impresión se elige "Guardar como PDF"). Al imprimir se ocultan los botones, el reloj, los formularios y el enlace al proyector; quedan un encabezado (nombre de la carrera, fecha, tiempo total y ganador), el podio, las posiciones y los incidentes. Los eliminados no aparecen.
  - **Proyector:** al terminar la carrera con el ganador definido muestra el podio en grande (con el zoom del ganador una sola vez) y debajo "Resto de las posiciones" del 4.º en adelante. Durante la carrera sigue la tabla normal.
  - Cambia `public/index.html` y `public/proyector.html`. No cambia el servidor ni la base.
  - El armado del podio del proyector se probó con una pantalla simulada (orden de escalones, empates, resto de posiciones y casos sin podio). Falta ver el podio y la impresión en el navegador real.
- [x] **Etapa 12: Historial de carreras.**
  - **Página `/historial`** (también con el enlace "Historial de carreras" en la pantalla de control): a la izquierda la lista de carreras (las 50 más recientes, la más nueva primero) con nombre, fecha y resumen (ganador, empate, "Sin largar", "En curso" o "Terminada con un empate sin resolver"); a la derecha, al elegir una, el detalle de solo lectura: ganador, tiempo total, posiciones, incidentes y los que no tuvieron resultado. Los eliminados de la tabla final no aparecen. La URL guarda la carrera elegida (`/historial#12`), así que se puede recargar y seguir viéndola.
  - Ruta nueva: `GET /api/carreras` (la lista con resumen). El detalle usa la ruta que ya existía (`GET /api/carreras/:id`). Cambia el servidor, `public/index.html` y se suma `public/historial.html`. No cambia la base.
  - Solo lectura: desde el historial no se puede modificar ni retomar una carrera vieja.
  - Pruebas: 21 casos en `npm run probar`, todos pasan (1 nuevo para el historial). La página se probó con una pantalla simulada (lista, empates, detalle ordenado, sin eliminados). Falta verla en el navegador real.
- [ ] **Etapa 13 (opcional): Tandas y final.** Varias tandas y una final con los mejores de cada una. Cambia la base (tablas nuevas). Solo si el evento lo necesita.
- [x] **Etapa 14: Participantes en el proyector.** Mientras la carrera no largó, el proyector muestra el bloque "Participantes" con los competidores anotados (número y nombre), así quienes compiten ven quiénes participan. La lista se arma sola a medida que se agregan o se quitan competidores en la pantalla de control, sin recargar (el proyector consulta cada medio segundo).
  - Antes se veía "Todavía nadie cruzó la meta." y el único dato de los anotados era el contador "3 de 8 competidores anotados" (que sigue). Si todavía no hay nadie, dice "Todavía no se anotó nadie."
  - Orden por número de competidor (igual que en la pantalla de control), no por orden de alta.
  - Con muchos participantes se reparten en más columnas (8 filas por columna, hasta 4) con letra algo más chica. Con cupos muy grandes (más de 32) puede no entrar todo en la pantalla.
  - Al largar, el bloque se reemplaza por las posiciones. Si la carrera se repite (todos con incidente), vuelve a mostrarse la lista de participantes.
  - Solo cambia `public/proyector.html`. No cambia el servidor, la base ni las pruebas de la API.
  - Probado con una pantalla simulada (sin anotados, 1 a 3, 9, 20 y 50 participantes, largada, carrera repetida y terminada). Falta verlo en el navegador real y en el proyector: ver los puntos 20 a 22 de `PRUEBA-A-MANO.md`.
- [x] **Etapa 15: Editar competidores.** Se puede corregir el nombre o el número de un competidor que se escribió mal. Cada fila tiene un botón **Editar** (en la lista de anotados) o un lápiz ✎ (en En pista, Posiciones e Incidentes): la fila pasa a dos campos (número y nombre) con **Guardar** y **Cancelar**. Enter guarda y Escape cancela.
  - Servidor: nueva ruta `PUT /api/carreras/:id/competidores/:cid` con `{ nombre, numero }`. Valida igual que el alta (nombre de hasta 80 letras, número entero de 1 a 9999; esa validación ahora es una sola función, `datosCompetidor`) y no deja repetir un número dentro de la carrera (409). Devuelve 404 si el competidor no existe, es de otra carrera o ya fue eliminado de la tabla final.
  - Se puede en **cualquier momento** (antes de largar, con la carrera en curso o terminada, con desempate): cambia solo el nombre y el número, no los tiempos, las llegadas ni los puestos.
  - Si el servidor rechaza el cambio (por ejemplo, número repetido), el aviso sale arriba y la fila queda abierta para corregirlo. Si se aprieta otro botón mientras se edita, la fila vuelve a su estado normal.
  - El proyector y el historial muestran el dato corregido solos (leen de la base). Los botones no se imprimen.
  - No cambia la base de datos.
  - Pruebas nuevas en `test/api.test.js` (2 casos: edición y validaciones; edición en curso y terminada sin alterar tiempos ni puestos). Probado además con una base y una pantalla simuladas. Falta verlo en el navegador real: ver los puntos 23 a 27 de `PRUEBA-A-MANO.md`.
- [x] **Extra: iniciar con doble clic.** El archivo `iniciar.bat` (en la carpeta `carrera-dragsters`) reemplaza el paso de abrir la cmd y escribir `npm start`.
  - Revisa que estén Node.js y el archivo `.env`, corre `npm install` solo la primera vez, prende el servidor y abre la pantalla de control en el navegador cuando está listo. La ventana negra que queda abierta **es el servidor**: para apagarlo se cierra.
  - Si el servidor no puede usar la base de datos, la ventana queda abierta con el mensaje (casi siempre es que MySQL no está prendido o falta revisar el `.env`).
  - MySQL tiene que estar prendido antes (si no arranca solo con Windows, hay que prenderlo a mano). `npm start` sigue funcionando igual que siempre.
  - En `src/server.js`, el servidor abre el navegador solo si existe la variable `ABRIR_NAVEGADOR=1`, que pone `iniciar.bat`. Usa el puerto del `.env`.
  - Para tenerlo en el escritorio: clic derecho sobre `iniciar.bat`, Enviar a, Escritorio (crear acceso directo).
  - No cambia la base de datos.
- [ ] Más adelante: sensor de llegada.

## Etapa 1: cómo correrla
1. Tener MySQL andando y cargar las tablas: `mysql -u root -p < database/schema.sql`
2. Copiar `.env.example` a `.env` y completar usuario y clave de MySQL.
3. `npm install` y después `npm start`.
4. Tiene que aparecer "Conectado a MySQL" y "Servidor en http://localhost:3000".
   Abrir `http://localhost:3000/api/salud` debe mostrar `{"servidor":"ok","base_de_datos":"conectada"}`.
5. Para guardar el avance con git: `git init`, `git add .`, `git commit -m "Etapa 1"`.

## Qué se verificó en la etapa 1
- Sin tablas, el servidor no arranca y explica qué falta.
- Con tablas, arranca y `/api/salud` responde "conectada".
- Si se cae la base, `/api/salud` responde 503 sin romper el servidor.
- La base rechaza números repetidos en una carrera y cupos menores a 2.
- Al borrar una carrera se borran sus competidores.
- Probado con MariaDB 10.11 (compatible con MySQL 8).

## Etapa 2: notas
- La pantalla usa Tailwind por CDN (`cdn.tailwindcss.com`), así que la compu necesita internet. Si más adelante
  hace falta que funcione sin conexión, se cambia por Tailwind compilado.
- API: `POST /api/carreras` {nombre, cupo 2 a 50}, `GET /api/carreras/:id`,
  `POST /api/carreras/:id/competidores` {nombre, numero 1 a 9999},
  `DELETE /api/carreras/:id/competidores/:cid` (solo antes de largar).
- Todas devuelven `{carrera, competidores, completa}`; `completa` es true cuando se cubrió el cupo.
- Al agregar un competidor se bloquea la carrera en una transacción para que dos altas a la vez no pasen el cupo.
- Todavía no hay botón de largada: llega en la etapa 3.
- Falta hacer el recorrido en el navegador: crear carrera, cargar hasta el cupo, probar número repetido y quitar.

## Estructura
- `database/schema.sql`: tablas `carreras` y `competidores`.
- `src/db.js`: conexión a MySQL.
- `src/server.js`: servidor Express (por ahora solo `/api/salud`).
