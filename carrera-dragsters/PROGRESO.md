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
- [ ] Etapa 4: Llegadas, incidentes y tabla en vivo (el circuito se detiene cuando todos llegaron o tienen incidente).
- [ ] Etapa 5: Empates y desempate (top 3, hasta 3 intentos). Requiere sumar las tablas `desempates` y `desempate_participantes`.
- [ ] Etapa 6: Ganador y gestión final (zoom/resaltado del 1.er puesto, eliminación manual).
- [ ] Etapa 7: Pruebas y pulido (casos raros, diseño con Tailwind para pantalla proyectada).
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
