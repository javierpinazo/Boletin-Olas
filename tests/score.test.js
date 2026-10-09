import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso } from '../job/parse-aviso.js';
import { parseTsunami } from '../job/parse-tsunami.js';
import {
  colorAltura, colorPeriodo, colorViento, colorDhn, tramoParaPlaya, nivelEn, estadoDhn,
  evaluarHora, evaluarPlayaDia, mejorPlaya, evaluarTsunami,
} from '../site/js/score.js';

const FX = new URL('./fixtures/', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
const u = config.umbrales;
const playa = (id) => config.playas.find((p) => p.id === id);
const aviso39 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[0]);

test('altura: límites exactos', () => {
  assert.equal(colorAltura(0.8, u).color, 'verde');
  assert.equal(colorAltura(0.81, u).color, 'amarillo');
  assert.equal(colorAltura(1.3, u).color, 'amarillo');
  assert.equal(colorAltura(1.31, u).color, 'rojo');
});

test('periodo: largo solo importa si hay olas', () => {
  assert.equal(colorPeriodo(18, 0.5, u).color, 'verde');
  assert.equal(colorPeriodo(12, 0.7, u).color, 'verde');
  assert.equal(colorPeriodo(13, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.9, u).color, 'rojo');
});

test('viento: límites y terral más estricto', () => {
  assert.equal(colorViento(12, 200, u).color, 'verde');
  assert.equal(colorViento(13, 200, u).color, 'amarillo');
  assert.equal(colorViento(21, 200, u).color, 'rojo');
  assert.equal(colorViento(8, 90, u).color, 'verde');
  assert.equal(colorViento(9, 90, u).color, 'amarillo');
  assert.equal(colorViento(16, 90, u).color, 'rojo');
  assert.equal(colorViento(9, 19, u).color, 'verde', '19° ya no es terral, 9 km/h < 12');
  assert.equal(colorViento(9, 20, u).color, 'amarillo', '20° es terral');
  assert.equal(colorViento(9, 160, u).color, 'amarillo', '160° es terral');
  assert.equal(colorViento(9, 161, u).color, 'verde');
});

test('dhn: niveles y desconocido', () => {
  assert.equal(colorDhn('normal').color, 'verde');
  assert.equal(colorDhn('ligero').color, 'verde');
  assert.equal(colorDhn('moderado').color, 'amarillo');
  assert.equal(colorDhn('fuerte').color, 'rojo');
  assert.equal(colorDhn('muy fuerte').color, 'rojo');
  assert.equal(colorDhn(null).color, 'amarillo');
});

test('tramo: La Punta va en "hasta Callao"; las otras tres "al sur de Callao"', () => {
  assert.match(tramoParaPlaya(playa('la-punta'), aviso39).nombre, /Salaverry hasta Callao/);
  for (const id of ['san-bartolo', 'punta-hermosa', 'yuyos']) {
    assert.match(tramoParaPlaya(playa(id), aviso39).nombre, /Callao hasta San Juan de Marcona/);
  }
});

test('tramo: con el aviso 38 (límite en Chancay) todas caen al sur de Chancay', () => {
  const aviso38 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[1]);
  for (const p of config.playas) {
    assert.match(tramoParaPlaya(p, aviso38).nombre, /Chancay hasta San Juan de Marcona/);
  }
});

test('tramo: playa fuera de los tramos conocidos -> null', () => {
  assert.equal(tramoParaPlaya({ lat: -25, lon: -70 }, aviso39), null);
  assert.equal(tramoParaPlaya(playa('yuyos'), null), null);
});

test('nivelEn sigue la línea de tiempo y vence con el aviso', () => {
  const t = tramoParaPlaya(playa('yuyos'), aviso39);
  assert.equal(nivelEn(t, aviso39, '2026-10-06T10:00:00-05:00'), 'normal');
  assert.equal(nivelEn(t, aviso39, '2026-10-07T13:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T11:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T12:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-12T23:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-13T00:00:00-05:00'), null);
});

test('estadoDhn', () => {
  const ahora = Date.parse('2026-10-09T15:00:00Z');
  assert.equal(estadoDhn(null, ahora, u), 'ausente');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z' }, ahora, u), 'ok');
  assert.equal(estadoDhn({ generadoEn: '2026-10-07T10:31:00Z' }, ahora, u), 'obsoleto');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z', parseError: true }, ahora, u), 'errorParseo');
});

test('evaluarHora: el peor factor manda y datos faltantes no dan verde', () => {
  const ctx = { umbrales: u, nivelDhn: 'ligero', estado: 'ok', tsunamiAlerta: false };
  const bueno = { hora: '2026-10-09T07:00', hs: 0.5, tp: 9, vientoKmh: 6, dirViento: 200 };
  assert.equal(evaluarHora(bueno, ctx).color, 'verde');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: 25 }, ctx).color, 'rojo');
  assert.equal(evaluarHora({ ...bueno, hs: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, nivelDhn: 'moderado' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, estado: 'obsoleto' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, tsunamiAlerta: true }).color, 'rojo');
});

function dia(valores) {
  return valores.map(([h, hs, tp, v, dir]) => ({
    hora: `2026-10-09T${String(h).padStart(2, '0')}:00`, hs, tp, vientoKmh: v, dirViento: dir,
  }));
}
const dhn = { generadoEn: '2026-10-09T10:31:00Z', parseError: false, aviso: aviso39 };
const ahoraMs = Date.parse('2026-10-09T12:00:00Z');
const evaluar = (id, horasCrudas, extra = {}) =>
  evaluarPlayaDia({ playa: playa(id), horasCrudas, aviso: aviso39, dhn, ahoraMs, config, ...extra });

test('playa-día: bloque verde de la mañana y el viento rompe la tarde', () => {
  const r = evaluar('yuyos', dia([
    [12, 0.5, 9, 5, 200], [13, 0.5, 9, 6, 200], [14, 0.5, 9, 7, 200],
    [15, 0.5, 9, 14, 200], [16, 0.5, 9, 18, 200],
  ]));
  assert.equal(r.color, 'verde');
  assert.deepEqual([r.bloque.desde, r.bloque.hasta], [12, 15]);
  assert.match(r.motivo, /^Verde 12–15 h\. Luego: viento de 14 km\/h/);
});

test('playa-día: una hora verde aislada no cuenta como bloque', () => {
  const r = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 25, 200], [14, 0.5, 9, 5, 200]]));
  assert.equal(r.bloque, null);
  assert.equal(r.color, 'rojo');
  assert.match(r.motivo, /^No apto/);
});

test('playa-día: sin verde de 2 h pero con amarillo contiguo -> amarillo', () => {
  const r = evaluar('yuyos', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200]]));
  assert.equal(r.color, 'amarillo');
  assert.equal(r.bloque.hasta - r.bloque.desde, 3);
});

test('playa-día: día sin datos', () => {
  const r = evaluar('yuyos', []);
  assert.equal(r.color, 'rojo');
  assert.equal(r.motivo, 'Sin datos para este día');
});

test('playa-día: el DHN moderado limita a amarillo aunque el mar esté plano', () => {
  const r = evaluar('yuyos', dia([[8, 0.4, 8, 3, 200], [9, 0.4, 8, 3, 200]]).map((h) => ({ ...h, hora: h.hora.replace('10-09', '10-08') })));
  assert.equal(r.color, 'amarillo', 'el 8/10 el tramo está en moderado');
});

test('playa-día: tsunami fuerza rojo', () => {
  const r = evaluar('yuyos', dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]), { tsunamiAlerta: true });
  assert.equal(r.color, 'rojo');
});

test('playa-día: sin aviso DHN -> tope amarillo y nota', () => {
  const r = evaluarPlayaDia({
    playa: playa('yuyos'), horasCrudas: dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]),
    aviso: null, dhn: null, ahoraMs, config,
  });
  assert.equal(r.color, 'amarillo');
  assert.ok(r.notas.length > 0);
});

test('mejorPlaya prefiere verde y luego bloque más largo', () => {
  const a = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200]]));
  const b = evaluar('la-punta', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200], [14, 0.5, 9, 5, 200]]));
  const c = evaluar('san-bartolo', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200], [15, 0.9, 9, 5, 200]]));
  assert.equal(mejorPlaya([a, b, c]).playa.id, 'la-punta');
  assert.equal(mejorPlaya([c]).playa.id, 'san-bartolo');
  assert.equal(mejorPlaya([evaluar('yuyos', [])]), null);
});

test('tsunami: sin riesgo es informativo; el boletín de mayor versión del evento manda', () => {
  const [b2, b1] = separarItems(fs.readFileSync(new URL('tsunami.html', FX), 'utf8')).map(parseTsunami);
  const ahora = Date.parse('2026-10-09T20:00:00Z');
  assert.equal(b1.generaTsunamiEnPeru, true, 'el -1 solo "intensifica vigilancia"');
  const r = evaluarTsunami([b1, b2], ahora);
  assert.equal(r.estado, 'informativo');
  assert.equal(r.boletin.numero, '28-2026-2');
});

test('tsunami: alerta reciente -> alerta; vieja -> ninguno; texto raro -> alerta', () => {
  const base = { evento: '30-2026', version: 1, fechaLocal: '2026-10-09T10:00:00-05:00', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-11T20:00:00Z')).estado, 'ninguno');
  assert.equal(evaluarTsunami([{ ...base, fechaLocal: null }], Date.parse('2026-10-11T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([], 0).estado, 'ninguno');
});

test('tsunami: sin fechaLocal vale vistoEn (24 h)', () => {
  const b = { evento: '31-2026', version: 5, fechaLocal: null, vistoEn: '2026-10-09T10:00:00Z', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-10T20:00:00Z')).estado, 'ninguno');
});
