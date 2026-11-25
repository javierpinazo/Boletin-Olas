// Tema visual: "clasico" (el diseño de siempre) u "oceano" (oscuro). Se carga como script normal en <head>,
// antes de la hoja de estilos, para fijar data-tema en <html> antes del primer pintado (sin parpadeo).
// Solo cambia la presentación: app.js escucha el evento "cambio-tema" y vuelve a pintar.
(function () {
  var CLAVE = 'tema';
  var TEMAS = ['clasico', 'oceano'];
  var FUENTES = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap';
  var raiz = document.documentElement;

  // <html data-solo-tema="oceano"> publica un único tema: se ignora la elección guardada y se oculta el botón.
  // Para volver a ofrecer los dos temas basta con quitar ese atributo de index.html.
  var fijo = raiz.getAttribute('data-solo-tema');

  function leer() {
    if (TEMAS.indexOf(fijo) >= 0) return fijo;
    try {
      var v = window.localStorage.getItem(CLAVE);
      return TEMAS.indexOf(v) >= 0 ? v : 'clasico';
    } catch (e) {
      return 'clasico';
    }
  }

  function guardar(tema) {
    try { window.localStorage.setItem(CLAVE, tema); } catch (e) { /* modo privado: solo dura esta visita */ }
  }

  // Las fuentes de Google solo se piden en modo océano: el clásico queda exactamente como estaba.
  function fuentes(tema) {
    if (tema !== 'oceano' || document.getElementById('fuentes-oceano')) return;
    var link = document.createElement('link');
    link.id = 'fuentes-oceano';
    link.rel = 'stylesheet';
    link.href = FUENTES;
    document.head.appendChild(link);
  }

  function aplicar(tema) {
    raiz.setAttribute('data-tema', tema);
    fuentes(tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'oceano' ? '#0e4f7a' : '#0b5ea8');
    var boton = document.getElementById('cambiar-tema');
    if (boton) {
      var oceano = tema === 'oceano';
      boton.setAttribute('aria-label', oceano ? 'Cambiar al diseño clásico' : 'Cambiar al modo océano (oscuro)');
      boton.setAttribute('aria-pressed', String(oceano));
      boton.setAttribute('title', oceano ? 'Diseño clásico' : 'Modo océano');
    }
  }

  aplicar(leer());

  document.addEventListener('DOMContentLoaded', function () {
    aplicar(leer());
    var boton = document.getElementById('cambiar-tema');
    if (!boton) return;
    if (fijo) {
      boton.hidden = true;
      return;
    }
    boton.addEventListener('click', function () {
      var nuevo = raiz.getAttribute('data-tema') === 'oceano' ? 'clasico' : 'oceano';
      guardar(nuevo);
      aplicar(nuevo);
      document.dispatchEvent(new CustomEvent('cambio-tema', { detail: { tema: nuevo } }));
    });
  });
})();
