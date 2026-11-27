# Barra de marca al hacer scroll

**Intención.** Que al bajar sigan visibles las dos marcas: Boletín Olas y Automatizate 360. No es publicidad.

**Diseño aprobado**
- Al entrar: distintivo de texto "Powered by Automatizate 360" a la derecha del título (pantallas ≥640 px) o debajo del título (celular).
- Al hacer scroll (cuando la cabecera sale de la pantalla): barra fija arriba con el símbolo y el nombre de Boletín Olas y, al costado, el distintivo. Si falta espacio, queda el símbolo sin el nombre.
- Tocar el símbolo vuelve al inicio; tocar el distintivo abre la web de Automatizate 360.
- La barra y el distintivo se ven siempre, también con alertas.
- Se quita el anuncio "¿Qué quieres automatizar?". La tarjeta de ITSE Fácil queda arriba, se desplaza con la página y se oculta con alertas.
- Cambio posterior (2026-11-27): se quita la tarjeta de ITSE Fácil. En la barra, el distintivo pasa a ser un botón
  "Te ayudamos a sacar tu ITSE · Powered by Automatizate 360" que lleva a itsefacil.com. La cabecera no cambia.
- El pie de página no cambia. La imagen para compartir no cambia.

**Enfoques.** Una sola forma razonable: HTML estático para la barra y el distintivo (se ven aunque falle la carga de datos) y un poco de JS para mostrar la barra. Generarlos desde config.json los haría depender de la red sin ganar nada.

**Queda a criterio de quien construye:** colores y medidas, con botones de al menos 44 px de alto en la barra.
