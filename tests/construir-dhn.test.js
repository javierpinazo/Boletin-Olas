import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { construirDhn, validarDhn } from '../job/construir-dhn.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');
const ahora = new Date('2026-10-09T15:00:00Z');

test('construirDhn con páginas reales: aviso 39, sin parseError, boletines de sismo', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora });
  assert.equal(d.aviso.numero, '39-26');
  assert.equal(d.parseError, false);
  assert.equal(d.tsunami.length, 2);
  assert.equal(d.generadoEn, '2026-10-09T15:00:00.000Z');
  validarDhn(d);
});

test('construirDhn: aviso ilegible conserva el último válido y marca parseError', () => {
  const previo = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora });
  const d = construirDhn({
    htmlAvisos: leer('aviso-redaccion-nueva.html'), htmlTsunami: leer('tsunami.html'), previo, ahora,
  });
  assert.equal(d.parseError, true);
  assert.equal(d.aviso.numero, '39-26');
  assert.match(d.avisoCrudo.titulo, /NRO\. 40-26/);
  assert.ok(d.avisoCrudo.texto.length > 20);
  assert.ok(d.avisoCrudo.motivo);
});

test('construirDhn: aviso ilegible sin previo -> aviso null pero válido', () => {
  const d = construirDhn({ htmlAvisos: leer('aviso-redaccion-nueva.html'), htmlTsunami: leer('tsunami.html'), ahora });
  assert.equal(d.aviso, null);
  assert.equal(d.parseError, true);
});

test('construirDhn: página sin avisos de oleaje falla (no publica basura)', () => {
  assert.throws(() => construirDhn({ htmlAvisos: '<html></html>', htmlTsunami: leer('tsunami.html'), ahora }), /ningún aviso/);
});

test('construirDhn: boletín de alerta se marca como riesgo', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami-alerta.html'), ahora });
  assert.equal(d.tsunami[0].generaTsunamiEnPeru, true);
});

test('construirDhn: boletines de hace más de 72 h se descartan', () => {
  const tarde = new Date('2026-10-20T15:00:00Z');
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora: tarde });
  assert.equal(d.tsunami.length, 0);
});

test('validarDhn rechaza JSON roto', () => {
  assert.throws(() => validarDhn({ generadoEn: 'x', parseError: false, aviso: null, tsunami: [] }), /generadoEn/);
  assert.throws(() => validarDhn({ generadoEn: '2026-10-09T00:00:00Z', parseError: false, aviso: null, tsunami: [] }), /sin aviso/);
});

const marJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wave_height: [0.7, null], wave_period: [9.1, 9.0] } };
const vientoJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wind_speed_10m: [5, 9], wind_direction_10m: [200, 210] } };

test('construirDhn: boletín de alerta de 2025 sin fecha no genera alerta en 2026', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami-alerta-2025.html'), ahora });
  assert.equal(d.tsunami.length, 0);
});

test('construirDhn: boletín de alerta sin fecha del año en curso se conserva 72 h desde que se vio', () => {
  const html = leer('tsunami-alerta-2025.html').replace('31-2025-5', '31-2026-5');
  const d1 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, ahora });
  assert.equal(d1.tsunami.length, 1);
  assert.equal(d1.tsunami[0].generaTsunamiEnPeru, true);
  assert.equal(d1.tsunami[0].fechaLocal, null);
  assert.equal(d1.tsunami[0].vistoEn, ahora.toISOString());
  // 2 días después sigue; conserva el vistoEn original
  const dos = new Date('2026-10-11T15:00:00Z');
  const d2 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, previo: d1, ahora: dos });
  assert.equal(d2.tsunami[0].vistoEn, ahora.toISOString());
  // 4 días después ya no
  const cuatro = new Date('2026-10-13T16:00:00Z');
  const d3 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, previo: d1, ahora: cuatro });
  assert.equal(d3.tsunami.length, 0);
});
