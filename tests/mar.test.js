import test from 'node:test';
import assert from 'node:assert/strict';
import { combinarHoras, horasDelDia, ahoraLima, cargarMar, mareasDelDia, urlMar, urlViento } from '../site/js/mar.js';

const marJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wave_height: [0.7, null], wave_period: [9.1, 9.0] } };
const vientoJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wind_speed_10m: [5, 9], wind_direction_10m: [200, 210] } };

test('combinarHoras une por hora y conserva los nulos', () => {
  const h = combinarHoras(marJson, vientoJson);
  assert.deepEqual(h[0], {
    hora: '2026-10-09T06:00', hs: 0.7, tp: 9.1, vientoKmh: 5, dirViento: 200,
    dirOla: null, nivelMar: null, rafagaKmh: null,
  });
  assert.equal(h[1].hs, null);
  assert.throws(() => combinarHoras({}, vientoJson), /sin datos horarios/);
});

test('horasDelDia: ventana [6,17) y descarta horas pasadas de hoy', () => {
  const horas = [5, 6, 10, 16, 17].map((n) => ({ hora: `2026-10-09T${String(n).padStart(2, '0')}:00` }));
  const ventana = { horaInicio: 6, horaFin: 17 };
  assert.deepEqual(horasDelDia(horas, '2026-10-09', ventana, Date.parse('2026-10-09T06:00:00Z')).map((h) => h.hora.slice(11, 13)), ['06', '10', '16']);
  // 15:30 UTC = 10:30 Lima: ya pasó la hora 06, la hora 10 sigue vigente
  assert.deepEqual(horasDelDia(horas, '2026-10-09', ventana, Date.parse('2026-10-09T15:30:00Z')).map((h) => h.hora.slice(11, 13)), ['10', '16']);
  assert.equal(ahoraLima(Date.parse('2026-10-09T03:00:00Z')), '2026-10-08T22:00');
});

test('cargarMar: error HTTP lanza', async () => {
  const falso = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => cargarMar({ lat: 0, lon: 0 }, falso), /503/);
});

test('urls: piden dirección de ola, nivel del mar y ráfagas', () => {
  assert.match(urlMar({ lat: 1, lon: 2 }), /wave_direction/);
  assert.match(urlMar({ lat: 1, lon: 2 }), /sea_level_height_msl/);
  assert.match(urlViento({ lat: 1, lon: 2 }), /wind_gusts_10m/);
});

test('combinarHoras: ráfagas, dirección de ola y nivel del mar', () => {
  const mar = { hourly: { time: ['2026-10-09T06:00'], wave_height: [1.6], wave_period: [11.8], wave_direction: [205], sea_level_height_msl: [0.7] } };
  const viento = { hourly: { time: ['2026-10-09T06:00'], wind_speed_10m: [7], wind_direction_10m: [180], wind_gusts_10m: [13] } };
  const [h] = combinarHoras(mar, viento);
  assert.equal(h.dirOla, 205);
  assert.equal(h.nivelMar, 0.7);
  assert.equal(h.rafagaKmh, 13);
});

// Serie real de Open-Meteo para Barranco del 2026-10-10 (nivel del mar, m, 00 a 23 h).
const NIVEL = [0.18, 0.32, 0.49, 0.65, 0.75, 0.77, 0.7, 0.56, 0.37, 0.19, 0.07, 0.03, 0.08, 0.21, 0.4, 0.6, 0.75, 0.82, 0.81, 0.72, 0.56, 0.38, 0.24, 0.16];
const serie = (fecha, niveles) => niveles.map((n, i) => ({ hora: `${fecha}T${String(i).padStart(2, '0')}:00`, nivelMar: n }));

test('mareasDelDia: pleamares y bajamares del día en orden', () => {
  assert.deepEqual(mareasDelDia(serie('2026-10-10', NIVEL), '2026-10-10'), [
    { tipo: 'pleamar', hora: 5, nivel: 0.77 },
    { tipo: 'bajamar', hora: 11, nivel: 0.03 },
    { tipo: 'pleamar', hora: 17, nivel: 0.82 },
  ]);
});

test('mareasDelDia: usa las horas vecinas de otros días para los extremos del borde', () => {
  const horas = [...serie('2026-10-09', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3]), ...serie('2026-10-10', [0.2, 0.4])];
  assert.deepEqual(mareasDelDia(horas, '2026-10-10'), [{ tipo: 'bajamar', hora: 0, nivel: 0.2 }]);
});

test('mareasDelDia: sin datos de nivel devuelve lista vacía', () => {
  assert.deepEqual(mareasDelDia(serie('2026-10-10', [null, null, null]), '2026-10-10'), []);
});

test('cargarMar: si Open-Meteo no responde en el plazo, falla con un mensaje claro', async () => {
  // AbortSignal.timeout no mantiene vivo el bucle de eventos (en Node 22 el runner cancelaba la prueba):
  // el fetch falso lo sostiene con su propio temporizador hasta que lo aborten.
  const colgado = (url, { signal }) => new Promise((_, rechazar) => {
    const sostener = setTimeout(() => {}, 5000);
    signal.addEventListener('abort', () => { clearTimeout(sostener); rechazar(signal.reason); });
  });
  await assert.rejects(() => cargarMar({ lat: 0, lon: 0 }, colgado, 30), /no respondió a tiempo/);
});
