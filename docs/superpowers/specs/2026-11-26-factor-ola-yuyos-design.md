# Factor de ola de Yuyos según el oleaje del DHN

**Intención.** Que la altura mostrada en Yuyos se parezca a lo que se ve en la zona de paddle, junto al espigón.

**Observado por el usuario (2026-11-26):** normal ≈ 0,5 m; leve 1 m; medio hasta 1,75 m; alto 1,75 m o más.

**Enfoques**
- Un solo factor (lo que había): ninguno reproduce los cuatro niveles. Con 0,34 el leve daría 0,59 m.
- Un factor por nivel del DHN (elegido): normal 0,34, leve 0,58, medio 0,73, alto 0,73.
- Mostrar directamente la altura observada por nivel: descartado, perdería la variación del modelo.

Los factores salen de dividir lo observado entre el promedio del modelo por nivel (11 ene – 25 nov 2026); en medio,
1,75 m se tomó como el extremo alto (percentil 90). No es una validación con mediciones.

**Decisiones aprobadas**
- Con el DHN al día y sin aviso vigente para la fecha: normal (opción A). El semáforo sigue con tope amarillo.
- DHN ausente, desactualizado, ilegible o sin tramo para la playa: 0,73.
- En Yuyos los registros de olas no reemplazan el factor; el viento aprendido sigue igual.
- `factorOla` 0,31 se conserva para versiones anteriores de la app que sigan en la caché de un celular.
- El factor de dirección se aplica encima, como antes.
