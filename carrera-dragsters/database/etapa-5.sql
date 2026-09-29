USE dragsters;

-- Un desempate: los empatados por un puesto corren de nuevo (ronda 1, 2 o 3).
CREATE TABLE IF NOT EXISTS desempates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carrera_id INT NOT NULL,
  posicion TINYINT UNSIGNED NOT NULL,   -- puesto que se disputa (1, 2 o 3)
  ronda TINYINT UNSIGNED NOT NULL,      -- intento: 1, 2 o 3
  inicio_ms BIGINT NOT NULL,
  UNIQUE KEY uq_carrera_posicion_ronda (carrera_id, posicion, ronda),
  FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE CASCADE
);

-- Quiénes corrieron cada desempate y cómo les fue.
CREATE TABLE IF NOT EXISTS desempate_participantes (
  desempate_id INT NOT NULL,
  competidor_id INT NOT NULL,
  estado ENUM('en_carrera','llego','incidente') NOT NULL DEFAULT 'en_carrera',
  tiempo_ms INT UNSIGNED NULL,
  PRIMARY KEY (desempate_id, competidor_id),
  FOREIGN KEY (desempate_id) REFERENCES desempates(id) ON DELETE CASCADE,
  FOREIGN KEY (competidor_id) REFERENCES competidores(id) ON DELETE CASCADE
);
