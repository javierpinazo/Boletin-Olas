import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLAYAS, CLAVE_MIS_PLAYAS, ORIGINALES, leerMisPlayas, playasAVer, agregar, quitar, mover, guardarMisPlayas,
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

test('sin nada elegido: lista vacía y no se guarda nada', () => {
  const a = almacen();
  assert.deepEqual(leerMisPlayas(a, CATALOGO), []);
  assert.equal(a.length, 0);
});

test('playasAVer: sin elección propia se ven las 4 de ejemplo; con elección, las suyas', () => {
  assert.deepEqual(playasAVer([]), ORIGINALES);
  assert.deepEqual(playasAVer(['mancora']), ['mancora']);
});

test('lista guardada: se quitan ids inexistentes y repetidos, y se corta en 6', () => {
  assert.deepEqual(leerMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: '["x","mancora","mancora"]' }), CATALOGO), ['mancora']);
  const ocho = CATALOGO.slice(0, 8);
  assert.deepEqual(leerMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: JSON.stringify(ocho) }), CATALOGO), ocho.slice(0, MAX_PLAYAS));
});

test('lista corrupta o vacía guardada: no lanza y devuelve vacío', () => {
  for (const crudo of ['{no', '{"a":1}', '[]', '["x"]']) {
    assert.deepEqual(leerMisPlayas(almacen({ [CLAVE_MIS_PLAYAS]: crudo }), CATALOGO), [], crudo);
  }
});

test('almacenamiento ausente o bloqueado: no rompe', () => {
  const lanza = () => { throw new Error('bloqueado'); };
  const bloqueado = { getItem: lanza, setItem: lanza, key: lanza, length: 0 };
  for (const a of [undefined, bloqueado]) {
    assert.deepEqual(leerMisPlayas(a, CATALOGO), []);
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
