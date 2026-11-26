// Fallos hallados en la revisión previa a producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as cache from '../site/js/cache.js';
import { panelSelector } from '../site/js/selector.js';

const leer = (r) => fs.readFileSync(new URL(r, import.meta.url), 'utf8');

test('cada archivo de datos se lee y se refresca con la misma clave de caché', () => {
  const app = leer('../site/js/app.js');
  const claves = new Map();
  for (const [, clave, url] of app.matchAll(/(?:json|fresco)\('([\w-]+)', '([^']+)'/g)) {
    claves.set(url, (claves.get(url) ?? new Set()).add(clave));
  }
  assert.ok(claves.has('./data/temp-mar.json'));
  for (const [url, usadas] of claves) assert.equal(usadas.size, 1, `${url}: ${[...usadas].join(', ')}`);
});

// Doble mínimo de `el`: guarda propiedades e hijos.
function el(tag, props = {}, ...hijos) {
  return {
    tag, props, hijos: hijos.flat().filter(Boolean),
    addEventListener() {}, replaceChildren(...n) { this.hijos = n; },
  };
}
const buscarFoco = (n, foco) => (n.props?.['data-foco'] === foco ? n : (n.hijos ?? []).map((h) => buscarFoco(h, foco)).find(Boolean));
const CATALOGO = { playas: [{ id: 'a', nombre: 'A', region: 'Piura' }] };
const panel = (ids, hayCargadas) => panelSelector({ el, catalogo: CATALOGO, ids, consulta: '', cerca: null, mensaje: '', hayCargadas });

test('selector: si se quitan todas las playas que se estaban viendo, "Listo" sigue disponible', () => {
  assert.ok(buscarFoco(panel([], true), 'listo'));
  assert.ok(buscarFoco(panel(['a'], false), 'listo'));
  assert.equal(buscarFoco(panel([], false), 'listo'), undefined, 'usuario nuevo sin nada elegido');
});

test('podarCache: borra el mar de otras selecciones y las claves antiguas, y nada más', () => {
  const m = new Map([
    ['cache:v1:mar:1,1', 'x'], ['cache:v1:mar:2,2', 'x'], ['cache:v1:temp-mar', 'x'], ['cache:v1:clima-mar', 'x'],
    ['cache:v1:grifos', 'x'], ['cache:v1:temp-mar-zonas', 'x'], ['boletin-olas:salidas:v1', '[]'], ['boletin-olas:mis-playas:v1', '[]'],
  ]);
  const a = { getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  cache.podarCache(a, 'mar:2,2');
  assert.deepEqual([...m.keys()], ['cache:v1:mar:2,2', 'cache:v1:grifos', 'cache:v1:temp-mar-zonas', 'boletin-olas:salidas:v1', 'boletin-olas:mis-playas:v1']);
  assert.doesNotThrow(() => cache.podarCache(undefined, 'mar:2,2'));
  assert.match(leer('../site/js/app.js'), /podarCache\(a, claveMar\)/);
});
