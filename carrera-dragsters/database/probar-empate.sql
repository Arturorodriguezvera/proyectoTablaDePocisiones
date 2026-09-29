-- SOLO PARA PROBAR. Fuerza un empate en la última carrera.
-- Antes: terminá una carrera de prueba (que todos lleguen).
-- Cambiá los números 1 y 2 por los de dos competidores que hayan llegado.
USE dragsters;
UPDATE competidores SET tiempo_ms = 12000
WHERE carrera_id = (SELECT id FROM carreras ORDER BY id DESC LIMIT 1)
  AND estado = 'llego' AND numero IN (1, 2);
-- Después recargá la página del navegador.
