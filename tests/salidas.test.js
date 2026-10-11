import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IMPRESIONES, nuevaSalida, agregarSalida, factorAprendido, fusionar, hsBaseDelDia, leerSalidas, guardarSalidas,
  IMPRESIONES_VIENTO, factorVientoAprendido, vientoBaseDelDia,
} from '../site/js/salidas.js';

const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
const u = config.umbrales;

const salida = (fecha, impresion, hsBase, playaId = 'yuyos') => nuevaSalida({ playaId, fecha, impresion, hsBase });

test('impresiones: cuatro opciones con su altura aproximada', () => {
  assert.deepEqual(Object.keys(IMPRESIONES), ['plano', 'olitas', 'conOlas', 'noSePodia']);
  assert.equal(IMPRESIONES.olitas.metros, 0.3);
});

test('nuevaSalida: una por playa y día (id fecha-playa); impresión desconocida se rechaza', () => {
  assert.deepEqual(salida('2026-10-10', 'olitas', 1.6), { id: '2026-10-10-yuyos', playaId: 'yuyos', fecha: '2026-10-10', impresion: 'olitas', hsBase: 1.6 });
  assert.throws(() => salida('2026-10-10', 'tsunami', 1.6), /Impresión desconocida/);
});

test('agregarSalida: registrar otra vez el mismo día reemplaza la anterior', () => {
  let lista = agregarSalida([], salida('2026-10-10', 'olitas', 1.6));
  lista = agregarSalida(lista, salida('2026-10-10', 'plano', 1.6));
  lista = agregarSalida(lista, salida('2026-10-11', 'olitas', 1.5));
  assert.equal(lista.length, 2);
  assert.equal(lista.find((s) => s.fecha === '2026-10-10').impresion, 'plano');
});

test('factorAprendido: con menos de 3 salidas no hay factor', () => {
  const lista = [salida('2026-10-10', 'olitas', 1.6), salida('2026-10-11', 'olitas', 1.6)];
  assert.equal(factorAprendido(lista, 'yuyos'), null);
});

test('factorAprendido: mediana de altura percibida / altura base, solo de esa playa', () => {
  const lista = [
    salida('2026-10-10', 'olitas', 1.5), // 0,2
    salida('2026-10-11', 'conOlas', 1.5), // 0,4
    salida('2026-10-12', 'plano', 1.0), // 0,1
    salida('2026-10-12', 'noSePodia', 1.0, 'san-bartolo'),
  ];
  assert.deepEqual(factorAprendido(lista, 'yuyos'), { factor: 0.2, n: 3 });
  assert.equal(factorAprendido(lista, 'san-bartolo'), null);
});

test('factorAprendido: ignora salidas sin altura base y acota el factor a [0,05, 1,5]', () => {
  const sinBase = [salida('2026-10-10', 'olitas', 0), salida('2026-10-11', 'olitas', null), salida('2026-10-12', 'olitas', 1.6)];
  assert.equal(factorAprendido(sinBase, 'yuyos'), null);
  const enorme = [1, 2, 3].map((d) => salida(`2026-10-1${d}`, 'noSePodia', 0.2));
  assert.equal(factorAprendido(enorme, 'yuyos').factor, 1.5);
});

test('fusionar: importar suma salidas nuevas y la importada gana si coincide el día; descarta basura', () => {
  const actual = [salida('2026-10-10', 'olitas', 1.6)];
  const importadas = [salida('2026-10-10', 'plano', 1.6), salida('2026-10-11', 'conOlas', 1.5), { id: 'x', playaId: 'yuyos', fecha: 'mal', impresion: 'olitas' }, 42];
  const r = fusionar(actual, importadas);
  assert.equal(r.length, 2);
  assert.equal(r.find((s) => s.fecha === '2026-10-10').impresion, 'plano');
  assert.throws(() => fusionar(actual, { no: 'es una lista' }), /no es una lista de salidas/);
});

test('hsBaseDelDia: media de la ola del modelo en la ventana, ya corregida por exposición (sin factor de ola)', () => {
  const horas = [5, 6, 7, 17].map((h) => ({ hora: `2026-10-10T${String(h).padStart(2, '0')}:00`, hs: h === 7 ? 2.0 : 1.0, dirOla: 205 }));
  assert.equal(hsBaseDelDia(horas, '2026-10-10', config.ventana, 225, u), 1.5, 'de frente: 6 h y 7 h');
  assert.equal(hsBaseDelDia(horas, '2026-10-10', config.ventana, 15, u), 0.45, 'de espaldas: x 0,3');
  assert.equal(hsBaseDelDia([], '2026-10-10', config.ventana, 225, u), null);
});

test('almacenamiento: guarda y lee del navegador; si falla o está corrupto devuelve lista vacía', () => {
  const memoria = new Map();
  const storage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
  assert.deepEqual(leerSalidas(storage), []);
  assert.equal(guardarSalidas(storage, [salida('2026-10-10', 'olitas', 1.6)]), true);
  assert.equal(leerSalidas(storage).length, 1);
  memoria.set('boletin-olas:salidas:v1', '{roto');
  assert.deepEqual(leerSalidas(storage), []);
  const bloqueado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.deepEqual(leerSalidas(bloqueado), []);
  assert.equal(guardarSalidas(bloqueado, []), false);
  assert.deepEqual(leerSalidas(undefined), []);
});

// ---------- Impresión del viento ----------

const conViento = (fecha, viento, vientoBase, playaId = 'yuyos') => nuevaSalida({ playaId, fecha, viento, vientoBase });

test('viento: cuatro impresiones con los km/h que representan', () => {
  assert.deepEqual(Object.keys(IMPRESIONES_VIENTO), ['calmo', 'moderado', 'fuerte', 'muyFuerte']);
  assert.deepEqual(Object.values(IMPRESIONES_VIENTO).map((v) => v.kmh), [5, 15, 25, 35]);
});

test('nuevaSalida: puede registrar solo el viento, solo las olas o ambos', () => {
  assert.deepEqual(conViento('2026-10-10', 'moderado', 12), { id: '2026-10-10-yuyos', playaId: 'yuyos', fecha: '2026-10-10', viento: 'moderado', vientoBase: 12 });
  assert.deepEqual(salida('2026-10-10', 'olitas', 1.6), { id: '2026-10-10-yuyos', playaId: 'yuyos', fecha: '2026-10-10', impresion: 'olitas', hsBase: 1.6 });
  const ambos = nuevaSalida({ playaId: 'yuyos', fecha: '2026-10-10', impresion: 'olitas', hsBase: 1.6, viento: 'calmo', vientoBase: 12 });
  assert.equal(ambos.viento, 'calmo');
  assert.equal(ambos.impresion, 'olitas');
});

test('nuevaSalida: sin ninguna impresión, o con una de viento desconocida, se rechaza', () => {
  assert.throws(() => nuevaSalida({ playaId: 'yuyos', fecha: '2026-10-10' }), /Falta la impresión/);
  assert.throws(() => nuevaSalida({ playaId: 'yuyos', fecha: '2026-10-10', viento: 'huracan', vientoBase: 10 }), /Impresión de viento desconocida/);
});

test('agregarSalida: el viento y las olas del mismo día y playa se juntan en un solo registro', () => {
  let lista = agregarSalida([], salida('2026-10-10', 'olitas', 1.6));
  lista = agregarSalida(lista, conViento('2026-10-10', 'calmo', 12));
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], { id: '2026-10-10-yuyos', playaId: 'yuyos', fecha: '2026-10-10', impresion: 'olitas', hsBase: 1.6, viento: 'calmo', vientoBase: 12 });
  lista = agregarSalida(lista, conViento('2026-10-10', 'fuerte', 12));
  assert.equal(lista[0].viento, 'fuerte', 'cambiar la impresión del día la reemplaza');
  assert.equal(lista[0].impresion, 'olitas', 'sin tocar la otra');
});

test('factorVientoAprendido: con menos de 3 salidas con viento no hay factor', () => {
  assert.equal(factorVientoAprendido([conViento('2026-10-10', 'calmo', 12), conViento('2026-10-11', 'calmo', 12)], 'yuyos'), null);
});

test('factorVientoAprendido: mediana de km/h percibidos / km/h del modelo, solo de esa playa', () => {
  const lista = [
    conViento('2026-10-10', 'calmo', 10), // 0,5
    conViento('2026-10-11', 'moderado', 15), // 1
    conViento('2026-10-12', 'calmo', 20), // 0,25
    conViento('2026-10-12', 'fuerte', 10, 'san-bartolo'),
    salida('2026-10-13', 'olitas', 1.5), // sin viento: no cuenta
  ];
  assert.deepEqual(factorVientoAprendido(lista, 'yuyos'), { factor: 0.5, n: 3 });
  assert.equal(factorVientoAprendido(lista, 'san-bartolo'), null);
});

test('factorVientoAprendido: ignora salidas sin viento base y acota el factor a [0,2; 1,5]', () => {
  const sinBase = [conViento('2026-10-10', 'calmo', 0), conViento('2026-10-11', 'calmo', null), conViento('2026-10-12', 'calmo', 10)];
  assert.equal(factorVientoAprendido(sinBase, 'yuyos'), null);
  const bajo = [1, 2, 3].map((d) => conViento(`2026-10-1${d}`, 'calmo', 100));
  assert.equal(factorVientoAprendido(bajo, 'yuyos').factor, 0.2);
  const alto = [1, 2, 3].map((d) => conViento(`2026-10-1${d}`, 'muyFuerte', 5));
  assert.equal(factorVientoAprendido(alto, 'yuyos').factor, 1.5);
});

test('factorAprendido (olas) no se confunde con registros que solo traen viento', () => {
  const lista = [conViento('2026-10-10', 'calmo', 10), conViento('2026-10-11', 'calmo', 10), conViento('2026-10-12', 'calmo', 10)];
  assert.equal(factorAprendido(lista, 'yuyos'), null);
});

test('vientoBaseDelDia: media del viento medio del modelo en la ventana', () => {
  const horas = [5, 6, 7, 17].map((h) => ({ hora: `2026-10-10T${String(h).padStart(2, '0')}:00`, vientoKmh: h === 7 ? 20 : 10 }));
  assert.equal(vientoBaseDelDia(horas, '2026-10-10', config.ventana), 15, 'solo 6 h y 7 h');
  assert.equal(vientoBaseDelDia([], '2026-10-10', config.ventana), null);
  assert.equal(vientoBaseDelDia([{ hora: '2026-10-10T08:00', vientoKmh: null }], '2026-10-10', config.ventana), null);
});

test('fusionar e importar: aceptan registros solo de viento; descartan los que no traen ninguna impresión', () => {
  const importadas = [conViento('2026-10-11', 'fuerte', 14), { id: 'x', playaId: 'yuyos', fecha: '2026-10-12' }];
  const r = fusionar([], importadas);
  assert.equal(r.length, 1);
  assert.equal(r[0].viento, 'fuerte');
});

test('almacenamiento: los registros de antes (solo olas) se siguen leyendo; los de solo viento también', () => {
  const memoria = new Map();
  const storage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
  guardarSalidas(storage, [salida('2026-10-10', 'olitas', 1.6), conViento('2026-10-11', 'calmo', 12)]);
  assert.equal(leerSalidas(storage).length, 2);
});
