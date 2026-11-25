import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLAYAS, CLAVE_MIS_PLAYAS, ORIGINALES, iniciarMisPlayas, agregar, quitar, mover, guardarMisPlayas,
} from '../site/js/mis-playas.js';

function almacen(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
const CATALOGO = [...ORIGINALES, 'mancora', 'lobitos', 'huanchaco', 'ilo', 'colan'];

test('usuario nuevo: lista vacía, y sigue vacía aunque después ya haya caché', () => {
  const a = almacen();
  assert.deepEqual(iniciarMisPlayas(a, CATALOGO), []);
  a.setItem('cache:v1:temp-mar', '{}');
  assert.deepEqual(iniciarMisPlayas(a, CATALOGO), []);
});

test('usuario actual con salidas o con caché: empieza con las 4 originales', () => {
  assert.deepEqual(iniciarMisPlayas(almacen({ 'boletin-olas:salidas:v1': '[]' }), CATALOGO), ORIGINALES);
  assert.deepEqual(iniciarMisPlayas(almacen({ 'cache:v1:grifos': '{}' }), CATALOGO), ORIGINALES);
});

test('lista guardada: se quitan ids inexistentes y repetidos, y se corta en 6', () => {
  assert.deepEqual(iniciarMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: '["x","mancora","mancora"]' }), CATALOGO), ['mancora']);
  const ocho = CATALOGO.slice(0, 8);
  assert.deepEqual(iniciarMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: JSON.stringify(ocho) }), CATALOGO), ocho.slice(0, MAX_PLAYAS));
});

test('lista corrupta: no lanza y devuelve vacío', () => {
  assert.deepEqual(iniciarMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: '{no' }), CATALOGO), []);
  assert.deepEqual(iniciarMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: '{"a":1}' }), CATALOGO), []);
});

test('almacenamiento ausente o bloqueado: no rompe', () => {
  const lanza = () => { throw new Error('bloqueado'); };
  const bloqueado = { getItem: lanza, setItem: lanza, key: lanza, length: 0 };
  for (const a of [undefined, bloqueado]) {
    assert.deepEqual(iniciarMisPlayas(a, CATALOGO), []);
    assert.equal(guardarMisPlayas(a, ['mancora']), false);
  }
  assert.equal(guardarMisPlayas(almacen(), ['mancora']), true);
});

test('agregar, quitar y mover', () => {
  assert.deepEqual(agregar(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(agregar(['a'], 'a'), ['a']);
  const seis = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(agregar(seis, 'g'), seis);
  assert.deepEqual(quitar(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(mover(['a', 'b'], 'a', -1), ['a', 'b']);
  assert.deepEqual(mover(['a', 'b'], 'b', 1), ['a', 'b']);
  assert.deepEqual(mover(['a', 'b'], 'b', -1), ['b', 'a']);
});
