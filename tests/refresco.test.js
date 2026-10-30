import test from 'node:test';
import assert from 'node:assert/strict';
import { decidir } from '../job/refresco.js';

const ahora = Date.parse('2026-10-30T15:00:00Z');
const hace = (h) => new Date(ahora - h * 3600_000).toISOString();

test('menos de 3 h desde la última actualización: no actualiza', () => {
  assert.deepEqual(decidir({ generadoEn: hace(2.9), ahora }), { actualizar: false, razon: 'reciente' });
});

test('3 h o más: actualiza', () => {
  assert.equal(decidir({ generadoEn: hace(3), ahora }).actualizar, true);
  assert.equal(decidir({ generadoEn: hace(20), ahora }).razon, 'antiguo');
});

test('sin datos previos: actualiza', () => {
  assert.deepEqual(decidir({ generadoEn: null, ahora }), { actualizar: true, razon: 'sin-datos' });
});

test('tras un fallo reciente espera antes de reintentar, luego vuelve a intentar', () => {
  assert.equal(decidir({ generadoEn: hace(10), ahora, ultimoFallo: ahora - 2 * 60_000 }).razon, 'fallo-reciente');
  assert.equal(decidir({ generadoEn: hace(10), ahora, ultimoFallo: ahora - 6 * 60_000 }).actualizar, true);
});
