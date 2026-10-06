# Prueba a mano: cuenta regresiva (etapa 10e)

Esta lista se hace una sola vez, con el servidor prendido (`npm start`) y el navegador. No lleva código:
si algo no pasa como dice acá, sacale una captura y mandala para arreglarlo.

**Antes de empezar:** abrí la pantalla de control en `http://localhost:3000` y, con el enlace
**Abrir vista de proyector**, abrí el proyector en otra ventana. Poné las dos ventanas lado a lado.
Refrescá las dos con **Ctrl+F5**.

Marcá cada punto con una X cuando te salga bien.

## A. Cuenta regresiva de la carrera
1. [ ] Creá una carrera con **cupo 3** y cargá 3 competidores.
2. [ ] Apretá **Largar**. En el control se ve **3, 2, 1** en el reloj grande y el estado dice "Preparados...".
3. [ ] En el proyector se ve **3, 2, 1** a pantalla completa, casi al mismo tiempo que en el control.
4. [ ] Durante la cuenta, los botones **Llegó** e **Incidente** del control están **apagados** (no se pueden apretar).
5. [ ] En el "ya" aparece **¡YA!** en las dos pantallas y enseguida el reloj empieza a contar.
6. [ ] Los botones se **prenden solos** en el "ya". Apretá **Llegó** a un competidor: aparece en Posiciones con un tiempo chico (no con 3 segundos de más).

## B. Recargar en medio de la cuenta
7. [ ] Creá otra carrera (cupo 2), apretá **Largar** y **recargá el control** (F5) mientras cuenta. Tiene que seguir contando desde donde estaba y terminar en el ¡YA! a la hora justa.
8. [ ] Repetí, pero recargando **el proyector** en medio de la cuenta. Tiene que retomar la cuenta y llegar al ¡YA! junto con el control.

## C. Deshacer y repetir
9. [ ] Terminá una carrera y apretá **Deshacer** en uno de la tabla. La carrera se reabre y el reloj **sigue** desde donde estaba: **no** vuelve a aparecer la cuenta regresiva.
10. [ ] Creá una carrera de cupo 2, largá y, una vez pasado el "ya", marcá **Incidente** a los dos. Aparece el aviso de que la carrera se repite. Apretá **Largar** de nuevo: tiene que haber una **cuenta regresiva nueva**.

## D. Desempate con cuenta regresiva
11. [ ] Armá un empate: terminá una carrera con 3 competidores y, en phpMyAdmin, corré `database/probar-empate.sql` (cambiá los números `1, 2` por los de dos que hayan llegado). Recargá el control: aparece el panel rojo de empate.
12. [ ] Apretá **Largar desempate**. Se ve **3, 2, 1, ¡YA!** en el control y en el proyector, y los botones **Llegó** del desempate están apagados hasta el "ya".
13. [ ] Terminá el desempate marcando **Llegó** a los dos: se define el ganador y se ve el zoom amarillo en las dos pantallas.

## E. Proyector real
14. [ ] Pasá la ventana del proyector al proyector de verdad y apretá **F11**. Mirá desde el fondo del salón: ¿se leen bien el 3, 2, 1, el reloj y las posiciones?
15. [ ] Con una carrera en pantalla, cortá el servidor (Ctrl+C en la ventana negra). El proyector tiene que mostrar **"Sin conexión con el servidor"** y conservar lo último que vio. Volvé a prender (`npm start`): el aviso desaparece solo.

## F. Sonido de la cuenta regresiva
16. [ ] En el control apretá **Probar sonido** (en el encabezado): suena un pitido corto. Ajustá el volumen de la compu.
17. [ ] Largá una carrera: suena un pitido en el **3**, otro en el **2**, otro en el **1** y uno **más agudo y largo** en el **¡YA!**, justo cuando cambia el número en pantalla.
18. [ ] Con el control y el proyector en la misma compu, el sonido se oye **una sola vez** (no doble ni con eco).
19. [ ] Recargá el control a mitad de la cuenta (F5) y tocá la ventana: suenan los pitidos que faltan, sin repetir los anteriores. Largá un desempate: también suena.

## G. Participantes en el proyector (etapa 14)
20. [ ] Creá una carrera de cupo 4 y mirá el proyector: dice "Esperando la largada" y "Todavía no se anotó nadie.".
21. [ ] Agregá competidores en el control: cada uno aparece en el proyector en menos de un segundo, sin recargar, ordenado por número. Quitá uno con **Quitar**: desaparece del proyector.
22. [ ] Completá el cupo y largá: la lista de participantes se reemplaza por las posiciones. Mirá desde el fondo del salón si se leen bien los nombres.

## Si algo falla
Anotá el número del punto, sacale una captura a la pantalla (control y proyector si se puede) y, si hay un
cartel rojo o una ventana negra con un error, copiá también ese mensaje.
