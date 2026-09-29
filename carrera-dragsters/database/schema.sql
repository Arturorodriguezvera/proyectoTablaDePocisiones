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
