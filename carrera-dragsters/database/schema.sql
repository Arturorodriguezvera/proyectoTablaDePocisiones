CREATE DATABASE IF NOT EXISTS dragsters CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dragsters;

-- Una carrera: tiene un cupo de participantes y un estado general.
CREATE TABLE IF NOT EXISTS carreras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  cupo TINYINT UNSIGNED NOT NULL,
  estado ENUM('configuracion','en_curso','finalizada') NOT NULL DEFAULT 'configuracion',
  inicio_ms BIGINT NULL,   -- momento de la largada (ms desde 1970)
  fin_ms BIGINT NULL,      -- momento en que se detuvo el circuito
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (cupo >= 2)
);

-- Un competidor dentro de una carrera.
CREATE TABLE IF NOT EXISTS competidores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carrera_id INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  numero SMALLINT UNSIGNED NOT NULL,
  estado ENUM('en_carrera','llego','incidente') NOT NULL DEFAULT 'en_carrera',
  tiempo_ms INT UNSIGNED NULL,          -- tiempo de llegada desde la largada
  eliminado TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_carrera_numero (carrera_id, numero),
  FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE CASCADE
);


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
