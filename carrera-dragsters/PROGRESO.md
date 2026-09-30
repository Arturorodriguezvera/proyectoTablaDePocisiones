# Carreras de dragsters escolares: estado del proyecto

## Stack y decisiones
- Backend: Node.js + Express. Base de datos: MySQL. Frontend: JavaScript + Tailwind CSS.
- Una sola pantalla por ahora (sin tiempo real entre dispositivos).
- Cronometraje manual: botón "Llegó" por competidor. Más adelante se reemplaza por un sensor sin tocar el resto.
- Empates: si dos o más competidores empatan en cualquiera de los primeros 3 puestos, corren de nuevo
  solo los empatados (desempate). Máximo 3 intentos; si siguen empatados, todos quedan con ese puesto.
- La largada solo se habilita con el cupo completo.
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
  - **Pruebas de la API** (`npm run probar`, con el servidor prendido): 11 casos contra una base real, todos pasan. Cubren cupo y números repetidos, largada incompleta, carrera normal, todos con incidente, un solo corredor que llega, doble clic (largada, llegada y altas simultáneas), empate por el 1.º, empate por el 3.º, empate en el 4.º (sin desempate), desempate con incidente, tres intentos empatados, dos empates en una misma carrera, y reglas de eliminación. Crea carreras "TEST ..." y las borra al terminar.
  - **Diseño para proyectar:** durante la carrera la pantalla se ensancha y muestra En pista / Incidentes a la izquierda y Posiciones a la derecha (en pantallas anchas); reloj más grande; letra más grande en pantallas de 1280 px o más.
  - Lo que NO está probado: la pantalla en el navegador (botones, animación del ganador, diseño). Falta hacer el recorrido a mano y ajustar lo que se vea mal en el proyector real.
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
