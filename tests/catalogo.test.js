import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizar, buscar, distanciaKm, cercanas, zonasDe, conGrifos } from '../site/js/catalogo.js';
import { tramoParaPlaya } from '../site/js/score.js';

const catalogo = JSON.parse(fs.readFileSync(new URL('../site/playas.json', import.meta.url), 'utf8'));
const { playas, zonas } = catalogo;
const REGIONES = ['Tumbes', 'Piura', 'Lambayeque', 'La Libertad', 'Áncash', 'Lima', 'Callao', 'Ica', 'Arequipa', 'Moquegua', 'Tacna'];
const ORIGINALES = {
  yuyos: { lat: -12.149, lon: -77.026, orientacion: 225, factorOla: 0.31, latTramo: undefined },
  'la-punta': { lat: -12.071, lon: -77.164, orientacion: 15, factorOla: 0.31, latTramo: -12.05 },
  'punta-hermosa': { lat: -12.337, lon: -76.826, orientacion: 240, factorOla: 0.31, latTramo: undefined },
  'san-bartolo': { lat: -12.389, lon: -76.779, orientacion: 260, factorOla: 0.31, latTramo: undefined },
};

test('catálogo: ids únicos en kebab-case y campos completos', () => {
  assert.equal(new Set(playas.map((p) => p.id)).size, playas.length);
  const idsZona = new Set(zonas.map((z) => z.id));
  for (const p of playas) {
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
    assert.ok(p.nombre, p.id);
    assert.ok(REGIONES.includes(p.region), `${p.id}: región ${p.region}`);
    assert.ok(p.lat >= -18.4 && p.lat <= -3.38, `${p.id}: lat ${p.lat}`);
    assert.ok(p.lon >= -81.4 && p.lon <= -70.3, `${p.id}: lon ${p.lon}`);
    assert.ok(Number.isFinite(p.orientacion) && p.orientacion >= 0 && p.orientacion < 360, p.id);
    assert.ok(idsZona.has(p.zonaTemp), `${p.id}: zona ${p.zonaTemp}`);
    assert.equal(typeof p.verificada, 'boolean', p.id);
  }
});

test('catálogo: 14 zonas de temperatura', () => {
  assert.equal(zonas.length, 14);
  for (const z of zonas) assert.ok(z.id && z.nombre && Number.isFinite(z.lat) && Number.isFinite(z.lon), z.id);
});

test('catálogo: las 4 originales no cambian', () => {
  for (const [id, esperado] of Object.entries(ORIGINALES)) {
    const p = playas.find((x) => x.id === id);
    assert.deepEqual({ lat: p.lat, lon: p.lon, orientacion: p.orientacion, factorOla: p.factorOla, latTramo: p.latTramo }, esperado, id);
    assert.equal(p.verificada, true, id);
  }
});

test('catálogo: las nuevas no heredan factor y entran sin verificar', () => {
  for (const p of playas.filter((x) => !(x.id in ORIGINALES))) {
    assert.equal(p.factorOla, undefined, p.id);
    assert.equal(p.verificada, false, p.id);
  }
});

test('catálogo: cada playa cae en un tramo del DHN', () => {
  const aviso = {
    tramos: [
      { desde: 'tumbes', hasta: 'salaverry', desdeExclusivo: false },
      { desde: 'salaverry', hasta: 'san juan de marcona', desdeExclusivo: true },
      { desde: 'san juan de marcona', hasta: 'tacna', desdeExclusivo: true },
    ],
  };
  const sinTramo = playas.filter((p) => !tramoParaPlaya(p, aviso)).map((p) => p.id);
  assert.deepEqual(sinTramo, []);
});

test('catálogo: cubre las 11 regiones y va de norte a sur', () => {
  for (const r of REGIONES) assert.ok(playas.some((p) => p.region === r), r);
  for (let i = 1; i < playas.length; i += 1) assert.ok(playas[i].lat <= playas[i - 1].lat + 0.2, `${playas[i - 1].id} -> ${playas[i].id}`);
});

const ids = (lista) => lista.map((p) => p.id);

test('buscar: ignora tildes y mayúsculas', () => {
  assert.equal(normalizar('  MÁNCORA  '), 'mancora');
  assert.ok(ids(buscar(playas, 'MANCORA')).includes('mancora'));
  assert.ok(ids(buscar(playas, 'la libertad huan')).includes('huanchaco'));
  assert.equal(buscar(playas, '  ').length, playas.length);
  assert.deepEqual(buscar(playas, 'zzz'), []);
});

test('cercanas: ordena por distancia', () => {
  const r = cercanas(playas, { lat: -4.11, lon: -81.05 });
  assert.equal(r.length, 5);
  assert.equal(r[0].playa.id, 'mancora');
  assert.ok(r[0].km < 10);
  for (let i = 1; i < r.length; i += 1) assert.ok(r[i].km >= r[i - 1].km);
  const km = distanciaKm({ lat: -12, lon: -77 }, { lat: -13, lon: -77 });
  assert.ok(km > 110 && km < 112, String(km));
});

test('zonasDe: zonas distintas de las playas elegidas, en su orden', () => {
  assert.deepEqual(zonasDe([{ zonaTemp: 'callao' }, { zonaTemp: 'ilo' }, { zonaTemp: 'callao' }]), ['callao', 'ilo']);
  assert.deepEqual(zonasDe([]), []);
});

test('conGrifos: solo si alguna playa elegida es de Lima o Callao', () => {
  assert.equal(conGrifos([{ region: 'Piura' }, { region: 'Callao' }]), true);
  assert.equal(conGrifos([{ region: 'Lima' }]), true);
  assert.equal(conGrifos([{ region: 'Piura' }]), false);
  assert.equal(conGrifos([]), false);
});

test('clima: cada zona tiene su habitual completo', () => {
  const clima = JSON.parse(fs.readFileSync(new URL('../site/clima-mar.json', import.meta.url), 'utf8'));
  for (const z of zonas) {
    const serie = clima.zonas?.[z.id];
    assert.equal(serie?.length, 366, z.id);
    assert.ok(serie.every(Number.isFinite), z.id);
  }
});
