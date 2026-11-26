import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { barraVisible } from '../site/js/barra-marca.js';

const leer = (r) => fs.readFileSync(new URL(r, import.meta.url), 'utf8');
const html = leer('../site/index.html');
const entre = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const distintivo = (lugar) => new RegExp(`<a class="distintivo" href="https://automatizate360\\.web\\.app/\\?utm_source=boletin-olas&amp;utm_medium=${lugar}" target="_blank" rel="noopener noreferrer">Powered by <strong>Automatizate 360</strong></a>`);

test('barraVisible: la barra aparece cuando la cabecera ya salió de la pantalla', () => {
  assert.equal(barraVisible(120), false);
  assert.equal(barraVisible(1), false);
  assert.equal(barraVisible(0), true);
  assert.equal(barraVisible(-500), true);
});

test('cabecera: distintivo "Powered by Automatizate 360"', () => {
  assert.match(entre('<header', '</header>'), distintivo('cabecera'));
});

test('barra: símbolo que vuelve arriba y distintivo; no es publicidad', () => {
  const barra = entre('<div id="barra-marca"', '<main');
  assert.match(barra, /^<div id="barra-marca" class="barra-marca">/);
  assert.match(barra, /<a class="barra-inicio" href="#top" aria-label="Boletín Olas: volver arriba">\s*<svg/);
  assert.match(barra, /<span>Boletín Olas<\/span>/);
  assert.match(barra, distintivo('barra'));
  assert.doesNotMatch(barra, /publicidad|itse/i);
});

test('app.js muestra la barra al bajar, sin depender de datos ni alertas; la app sin conexión la incluye', () => {
  const app = leer('../site/js/app.js');
  assert.match(app, /barraMarca\.classList\.toggle\('visible', barraVisible\(cabecera\.getBoundingClientRect\(\)\.bottom\)\);/);
  assert.match(app, /addEventListener\('scroll', actualizarBarra, \{ passive: true \}\)/);
  assert.equal(app.match(/barraMarca\./g).length, 1);
  assert.match(leer('../site/sw.js'), /'\.\/js\/barra-marca\.js'/);
});

// Tras publicar, un celular puede cargar por un momento el app.js nuevo sobre la página anterior guardada.
test('app.js: sobre una página sin la barra no falla', () => {
  const app = leer('../site/js/app.js').replace(/\r\n/g, '\n');
  const desde = app.indexOf('function actualizarBarra() {');
  const funcion = app.slice(desde, app.indexOf('\n}', desde) + 2);
  const sinBarra = new Function('cabecera', 'barraMarca', 'barraVisible', `${funcion}\nactualizarBarra();`);
  assert.doesNotThrow(() => sinBarra({ getBoundingClientRect: () => ({ bottom: -1 }) }, null, barraVisible));
});

test('estilos: la barra empieza oculta, entra y sale con transición y respeta "reducir movimiento"', () => {
  const css = leer('../site/style.css').replace(/\r\n/g, '\n');
  const regla = (selector) => css.slice(css.indexOf('\n' + selector + ' {') + 1).split('}')[0];
  // Con visibility oculta no se puede tocar ni enfocar con el teclado.
  assert.match(regla('.barra-marca'), /visibility: hidden; opacity: 0; transform: translateY\(-100%\);/);
  assert.match(regla('.barra-marca'), /transition: transform [^;]*opacity [^;]*visibility 0s linear/);
  assert.match(regla('.barra-marca.visible'), /visibility: visible; opacity: 1; transform: none; transition-delay: 0s;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.barra-marca, \.barra-marca > a \{ transform: none; \}/);
});
