import test from 'node:test';
import assert from 'node:assert/strict';
import { posicionCiclo, indiceFase, iluminacion, tipoMarea, proximas, trazoLuz, NOMBRES } from '../site/js/luna.js';

const fase = (iso) => NOMBRES[indiceFase(posicionCiclo(Date.parse(iso)))];

test('fases conocidas de 2026 (tolerancia de unas horas)', () => {
  assert.equal(fase('2026-11-09T12:00:00Z'), 'Luna nueva'); // luna nueva real: 9 nov 07:02 UTC
  assert.equal(fase('2026-11-24T17:00:00Z'), 'Luna llena'); // luna llena real: 24 nov 14:53 UTC
  assert.equal(fase('2026-12-01T17:00:00Z'), 'Cuarto menguante');
  assert.equal(fase('2026-11-17T12:00:00Z'), 'Cuarto creciente');
});

test('iluminación: 0 en luna nueva, 1 en llena, 0,5 en cuartos', () => {
  assert.ok(iluminacion(0) < 1e-9);
  assert.ok(Math.abs(iluminacion(0.5) - 1) < 1e-9);
  assert.ok(Math.abs(iluminacion(0.25) - 0.5) < 1e-9);
});

test('tipoMarea: vivas cerca de nueva y llena, muertas cerca de los cuartos', () => {
  assert.equal(tipoMarea(0.01).tipo, 'viva');
  assert.equal(tipoMarea(0.5).tipo, 'viva');
  assert.equal(tipoMarea(0.25).tipo, 'muerta');
  assert.equal(tipoMarea(0.75).tipo, 'muerta');
  assert.equal(tipoMarea(0.125).tipo, 'intermedia');
});

test('proximas: la luna llena siguiente cae en el futuro y a menos de un mes', () => {
  const ahora = Date.parse('2026-11-24T17:00:00Z');
  const { nueva, llena } = proximas(ahora);
  assert.ok(nueva > ahora && llena > ahora);
  assert.ok(nueva - ahora <= 30 * 864e5 && llena - ahora <= 30 * 864e5);
  assert.equal(new Date(nueva).toISOString().slice(0, 7), '2026-12');
});

test('trazoLuz: el creciente se ilumina por la izquierda (hemisferio sur) y el menguante por la derecha', () => {
  assert.match(trazoLuz(0.25, 10), /^M0,-10 A10,10 0 0 0 0,10 /); // cuarto creciente: semicírculo izquierdo
  assert.match(trazoLuz(0.75, 10), /^M0,-10 A10,10 0 0 1 0,10 /); // cuarto menguante: semicírculo derecho
});
