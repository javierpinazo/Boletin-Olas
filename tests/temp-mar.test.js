import test from 'node:test';
import assert from 'node:assert/strict';
import { centroCelda, pedirCelda } from '../job/oisst.js';
import { construirTempMar } from '../job/temp-mar.js';

const csv = (...filas) => `time,zlev,latitude,longitude,sst\nUTC,m,degrees_north,degrees_east,degree_C\n${filas.join('\n')}\n`;
const ok = (texto) => ({ ok: true, status: 200, text: async () => texto });

test('centroCelda: centro de la celda de 0,25°', () => {
  assert.equal(centroCelda(-12.149), -12.125);
  assert.equal(centroCelda(-77.026), -77.125);
});

test('pedirCelda: si la celda es tierra (NaN) prueba la de más al oeste', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return ok(urls.length === 1 ? csv('2026-10-11T12:00:00Z,0.0,-12.125,-76.875,NaN') : csv('2026-10-11T12:00:00Z,0.0,-12.125,-77.125,23.25'));
  };
  const r = await pedirCelda({ lat: -12.149, lon: -76.9, desde: '2026-10-07', reciente: true, fetchFn });
  assert.equal(r.filas[0].sst, 23.25);
  assert.equal(urls.length, 2);
});

test('construirTempMar: toma el último día publicado de cada playa', async () => {
  const fetchFn = async () => ok(csv('2026-10-10T12:00:00Z,0,0,0,23.1', '2026-10-11T12:00:00Z,0,0,0,23.25'));
  const t = await construirTempMar([{ id: 'yuyos', lat: -12.149, lon: -77.026 }], { fetchFn, ahora: new Date('2026-10-12T15:00:00Z') });
  assert.deepEqual(t.playas.yuyos, { fecha: '2026-10-11', actual: 23.3, fuente: 'oisst', serie: [['2026-10-10', 23.1], ['2026-10-11', 23.3]] });
});

test('construirTempMar: si NOAA falla usa Open-Meteo (solo horas ya pasadas) y lo marca', async () => {
  const horas = ['2026-10-10T08:00', '2026-10-10T20:00', '2026-10-11T08:00', '2026-10-11T20:00'];
  const fetchFn = async (url) => (String(url).includes('open-meteo')
    ? { ok: true, status: 200, json: async () => ({ hourly: { time: horas, sea_surface_temperature: [22, 24, 23, 99] } }) }
    : { ok: false, status: 400 });
  const t = await construirTempMar([{ id: 'yuyos', lat: -12.149, lon: -77.026 }], { fetchFn, ahora: new Date('2026-10-11T18:00:00Z'), espera: 0 });
  assert.deepEqual(t.playas.yuyos, { fecha: '2026-10-11', actual: 23, fuente: 'openmeteo', serie: [['2026-10-10', 23], ['2026-10-11', 23]] });
  assert.match(t.fuente, /Open-Meteo/);
});

test('construirTempMar: si fallan las dos fuentes lanza el error con ambos motivos', async () => {
  const fetchFn = async () => ({ ok: false, status: 400 });
  await assert.rejects(() => construirTempMar([{ id: 'yuyos', lat: -12.1, lon: -77 }], { fetchFn, espera: 0 }), /respaldo/);
});
