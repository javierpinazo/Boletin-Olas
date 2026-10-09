import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseTsunami } from '../job/parse-tsunami.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('boletín de sismo sin riesgo (28-2026-2)', () => {
  const [b] = separarItems(leer('tsunami.html')).map(parseTsunami);
  assert.equal(b.numero, '28-2026-2');
  assert.equal(b.evento, '28-2026');
  assert.equal(b.version, 2);
  assert.equal(b.fechaLocal, '2026-10-09T12:56:00-05:00');
  assert.equal(b.magnitud, 7.6);
  assert.equal(b.lugar, '59 KM WSW OF LAS TABLAS, PANAMA');
  assert.equal(b.generaTsunamiEnPeru, false);
});

test('boletín de vigilancia (28-2026-1) no declara "no genera tsunami"', () => {
  const b = separarItems(leer('tsunami.html')).map(parseTsunami)[1];
  assert.equal(b.version, 1);
  assert.equal(b.lugar, '59 KM WSW OF LAS TABLAS, PANAMA', 'quita ", en tierra"');
  assert.equal(b.generaTsunamiEnPeru, true);
});

test('boletín de alerta real de 2025 (otro formato, sin fecha) cuenta como riesgo', () => {
  const b = parseTsunami(separarItems(leer('tsunami-alerta-2025.html'))[0]);
  assert.equal(b.numero, '31-2025-5');
  assert.equal(b.fechaLocal, null);
  assert.equal(b.generaTsunamiEnPeru, true);
});

test('boletín sin número en el título se rechaza', () => {
  assert.throws(() => parseTsunami({ titulo: 'BOLETÍN RARO', texto: 'x' }), /Sin número/);
});
