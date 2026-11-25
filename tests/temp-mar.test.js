import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { centroCelda, pedirCelda } from '../job/oisst.js';
import { construirTempMar, escribirTempMar } from '../job/temp-mar.js';

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

const CALLAO = { id: 'callao', lat: -12.07, lon: -77.2 };
const ILO = { id: 'ilo', lat: -17.7, lon: -71.4 };
const DATOS = csv('2026-10-10T12:00:00Z,0,0,0,23.1', '2026-10-11T12:00:00Z,0,0,0,23.25');
const AHORA = new Date('2026-10-12T15:00:00Z');
const haceHoras = (h) => new Date(AHORA.getTime() - h * 3600_000).toISOString();
const medida = (leidoEn, actual = 20) => ({ fecha: '2026-10-10', actual, fuente: 'oisst', serie: [['2026-10-10', actual]], leidoEn });

test('construirTempMar: toma el último día publicado de cada zona', async () => {
  const t = await construirTempMar([CALLAO], { fetchFn: async () => ok(DATOS), ahora: AHORA });
  assert.deepEqual(t.zonas.callao, {
    fecha: '2026-10-11', actual: 23.3, fuente: 'oisst', serie: [['2026-10-10', 23.1], ['2026-10-11', 23.3]], leidoEn: AHORA.toISOString(),
  });
});

test('construirTempMar: si NOAA falla usa Open-Meteo (solo horas ya pasadas) y lo marca', async () => {
  const horas = ['2026-10-10T08:00', '2026-10-10T20:00', '2026-10-11T08:00', '2026-10-11T20:00'];
  const fetchFn = async (url) => (String(url).includes('open-meteo')
    ? { ok: true, status: 200, json: async () => ({ hourly: { time: horas, sea_surface_temperature: [22, 24, 23, 99] } }) }
    : { ok: false, status: 400 });
  const t = await construirTempMar([CALLAO], { fetchFn, ahora: new Date('2026-10-11T18:00:00Z'), espera: 0 });
  const { leidoEn, ...resto } = t.zonas.callao;
  assert.deepEqual(resto, { fecha: '2026-10-11', actual: 23, fuente: 'openmeteo', serie: [['2026-10-10', 23], ['2026-10-11', 23]] });
  assert.match(t.fuente, /Open-Meteo/);
});

test('construirTempMar: si fallan las dos fuentes y no hay previo, lanza con ambos motivos', async () => {
  const fetchFn = async () => ({ ok: false, status: 400 });
  await assert.rejects(() => construirTempMar([CALLAO], { fetchFn, espera: 0 }), /respaldo/);
});

test('construirTempMar: una zona leída hace menos de 12 h no se vuelve a pedir', async () => {
  let llamadas = 0;
  const fetchFn = async () => { llamadas += 1; return ok(DATOS); };
  const previo = { zonas: { callao: medida(haceHoras(11)) } };
  const t = await construirTempMar([CALLAO], { fetchFn, ahora: AHORA, previo });
  assert.equal(llamadas, 0);
  assert.equal(t.zonas.callao.actual, 20);
  await construirTempMar([CALLAO], { fetchFn, ahora: AHORA, previo: { zonas: { callao: medida(haceHoras(13)) } } });
  assert.equal(llamadas, 1);
});

test('construirTempMar: si una zona falla conserva su dato anterior y actualiza las demás', async () => {
  const fetchFn = async (url) => (String(url).includes('-77.') ? { ok: false, status: 400 } : ok(DATOS));
  const viejo = medida(haceHoras(30), 19);
  const t = await construirTempMar([CALLAO, ILO], { fetchFn, ahora: AHORA, espera: 0, previo: { zonas: { callao: viejo } } });
  assert.deepEqual(t.zonas.callao, viejo);
  assert.equal(t.zonas.ilo.actual, 23.3);
});

test('construirTempMar: con las fuentes colgadas termina dentro del plazo y conserva lo anterior', async () => {
  const fetchFn = (url, { signal }) => new Promise((_, rechazar) => {
    const cortar = () => rechazar(new Error('abortado'));
    if (signal.aborted) cortar();
    else signal.addEventListener('abort', cortar);
  });
  const viejo = medida(haceHoras(30), 19);
  const inicio = Date.now();
  // el temporizador mantiene vivo el proceso: AbortSignal.timeout no lo hace
  const vivo = setTimeout(() => {}, 3000);
  const t = await construirTempMar([CALLAO], { fetchFn, ahora: AHORA, plazoMs: 200, espera: 5000, previo: { zonas: { callao: viejo } } });
  clearTimeout(vivo);
  assert.ok(Date.now() - inicio < 1500, `tardó ${Date.now() - inicio} ms`);
  assert.deepEqual(t.zonas.callao, viejo);
});

test('escribirTempMar: un archivo con el formato antiguo cuenta como sin previo y se conserva si todo falla', async () => {
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'temp-')), 'temp-mar.json');
  const antiguo = '{"generadoEn":"2026-10-12T10:00:00Z","playas":{"yuyos":{"actual":20}}}';
  fs.writeFileSync(destino, antiguo);
  await assert.rejects(() => construirTempMar([CALLAO], { fetchFn: async () => ({ ok: false, status: 400 }), espera: 0, previo: JSON.parse(antiguo) }), /respaldo/);
  await escribirTempMar([CALLAO], destino, { fetchFn: async () => ({ ok: false, status: 400 }), espera: 0 });
  assert.equal(fs.readFileSync(destino, 'utf8'), antiguo);
  await escribirTempMar([CALLAO], destino, { fetchFn: async () => ok(DATOS), ahora: AHORA });
  assert.equal(JSON.parse(fs.readFileSync(destino, 'utf8')).zonas.callao.actual, 23.3);
});
