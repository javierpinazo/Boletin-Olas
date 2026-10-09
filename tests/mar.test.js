import test from 'node:test';
import assert from 'node:assert/strict';
import { combinarHoras, horasDelDia, ahoraLima, cargarMar } from '../site/js/mar.js';

const marJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wave_height: [0.7, null], wave_period: [9.1, 9.0] } };
const vientoJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wind_speed_10m: [5, 9], wind_direction_10m: [200, 210] } };

test('combinarHoras une por hora y conserva los nulos', () => {
  const h = combinarHoras(marJson, vientoJson);
  assert.deepEqual(h[0], { hora: '2026-10-09T06:00', hs: 0.7, tp: 9.1, vientoKmh: 5, dirViento: 200 });
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
