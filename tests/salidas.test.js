import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IMPRESIONES, nuevaSalida, agregarSalida, factorAprendido, fusionar, hsBaseDelDia, leerSalidas, guardarSalidas,
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
