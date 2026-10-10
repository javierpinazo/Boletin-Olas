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

const sinBoletines = '<div class="accordion"><div class="position-relative"><div class="accordion-title">BOLETÍN DE SISMO TSUNAMI N° 1-2026-1</div><div class="accordion-content"><div class="text-justify">Sin nada. NO GENERA TSUNAMI EN LITORAL PERUANO.</div></div></div></div>';
const sinFecha2026 = () => leer('tsunami-alerta-2025.html').replace('31-2025-5', '31-2026-5');
const dia = (d, h = 15) => new Date(`2026-10-${String(d).padStart(2, '0')}T${h}:00:00Z`);
const correr = (htmlTsunami, previo, ahoraD) =>
  construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami, previo, ahora: ahoraD });

test('construirDhn: boletín de alerta sin fecha del año en curso vale 72 h desde que se vio', () => {
  const html = sinFecha2026();
  const base = correr(sinBoletines, null, dia(8));
  const d1 = correr(html, base, dia(9));
  assert.equal(d1.tsunami.length, 1);
  assert.equal(d1.tsunami[0].generaTsunamiEnPeru, true);
  assert.equal(d1.tsunami[0].fechaLocal, null);
  assert.equal(d1.tsunami[0].vistoEn, dia(9).toISOString());
  const d2 = correr(html, d1, dia(11));
  assert.equal(d2.tsunami[0].vistoEn, dia(9).toISOString(), 'conserva el vistoEn original');
  assert.equal(correr(html, d2, dia(13, 16)).tsunami.length, 0, 'a los 4 días ya no');
});

test('construirDhn: un boletín viejo sin fecha NO reaparece como alerta en corridas posteriores', () => {
  const html = sinFecha2026();
  let previo = correr(sinBoletines, null, dia(8));
  const visibles = [];
  for (let d = 9; d <= 25; d++) {
    previo = correr(html, previo, dia(d));
    visibles.push(previo.tsunami.length);
  }
  // visible los días 9 a 12 (la ventana de 72 h es inclusiva) y nunca más
  assert.deepEqual(visibles, [1, 1, 1, 1, ...Array(13).fill(0)]);
});

test('construirDhn: en la primera corrida (sin previo) un boletín sin fecha no cuenta como reciente', () => {
  assert.equal(correr(sinFecha2026(), null, dia(9)).tsunami.length, 0);
});

test('construirDhn: la página de sismo/tsunami sin ningún boletín hace fallar el job (canal de seguridad mudo)', () => {
  assert.throws(() => correr('<html><body>Sitio en mantenimiento</body></html>', null, dia(9)), /ningún boletín/);
});

test('construirDhn: un tramo con límite que no conocemos se trata como aviso no entendido', () => {
  const previo = correr(sinBoletines, null, dia(8));
  const htmlAvisos = leer('avisos-oleaje.html').replace('Al sur de Callao hasta San Juan de Marcona:', 'Al sur de Callao hasta Atlantis:');
  const d = construirDhn({ htmlAvisos, htmlTsunami: sinBoletines, previo, ahora: dia(9) });
  assert.equal(d.parseError, true);
  assert.match(d.avisoCrudo.motivo, /atlantis/i);
  assert.equal(d.aviso, previo.aviso, 'conserva el último aviso entendido');
});

test('construirDhn: elige el aviso de mayor número aunque se escriba "40 - 26" y el otro "39-26"', () => {
  const base = leer('avisos-oleaje.html');
  const html40 = base.replace(/<div class="position-relative">/, `<div class="position-relative">`);
  // Se renombra el aviso 39 (el primero) a "40 - 26" y se deja el 38 como "38-26".
  const modificado = html40.replace('NRO. 39-26 (Válido del 08 al 12 de octubre del 2026)', 'NRO. 40 - 26 (Válido del 08 al 12 de octubre 2026)');
  const d = correr(sinBoletines, null, dia(9));
  const r = construirDhn({ htmlAvisos: modificado, htmlTsunami: sinBoletines, previo: d, ahora: dia(9) });
  assert.equal(r.aviso.numero, '40-26');
});

test('construirDhn: con un aviso y su ACTUALIZACIÓN del mismo número gana el que aparece primero en el listado', () => {
  const base = leer('avisos-oleaje.html');
  const partes = base.split('<div class="position-relative">');
  const nuevo = partes[1].replace('NRO. 39-26 (Válido del 08 al 12 de octubre del 2026)', 'NRO. 39 - 26 (ACTUALIZACIÓN - Válido del 08 al 14 de octubre 2026)');
  const html = `${partes[0]}<div class="position-relative">${nuevo}<div class="position-relative">${partes[1]}<div class="position-relative">${partes[2]}`;
  const r = construirDhn({ htmlAvisos: html, htmlTsunami: sinBoletines, previo: correr(sinBoletines, null, dia(9)), ahora: dia(9) });
  assert.equal(r.aviso.validoHasta, '2026-10-14');
});

test('validarDhn acepta tramos en nivel normal', () => {
  const d = correr(sinBoletines, null, dia(9));
  const copia = structuredClone(d);
  copia.aviso.tramos[0].linea = [{ nivel: 'normal', desde: '2026-10-07T00:00:00-05:00' }];
  assert.doesNotThrow(() => validarDhn(copia));
});
