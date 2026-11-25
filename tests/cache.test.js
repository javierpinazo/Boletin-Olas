import test from 'node:test';
import assert from 'node:assert/strict';
import { leerCache, guardarCache, conCache, MAX_CACHE_MS } from '../site/js/cache.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('leerCache: vigente antes de 30 min, vencido desde los 30 min', () => {
  const a = memoria();
  guardarCache(a, 'mar:yuyos', [1, 2], 1_000);
  assert.deepEqual(leerCache(a, 'mar:yuyos', { ahora: 1_000 + MAX_CACHE_MS - 1 }).datos, [1, 2]);
  assert.equal(leerCache(a, 'mar:yuyos', { ahora: 1_000 + MAX_CACHE_MS }), null);
});

test('leerCache: un guardado con hora futura (reloj cambiado) o corrupto no se usa', () => {
  const a = memoria();
  guardarCache(a, 'x', 1, 5_000);
  assert.equal(leerCache(a, 'x', { ahora: 4_000 }), null);
  a.setItem('cache:v1:y', '{no es json');
  assert.equal(leerCache(a, 'y'), null);
});

test('conCache: no pide si está vigente; pide si vence o si se fuerza', async () => {
  const a = memoria();
  let pedidos = 0;
  const pedir = async () => { pedidos += 1; return { n: pedidos }; };
  const r1 = await conCache(a, 'k', pedir, { ahora: 0 });
  const r2 = await conCache(a, 'k', pedir, { ahora: 10 * 60_000 });
  assert.equal(pedidos, 1);
  assert.equal(r2.desdeCache, true);
  assert.equal(r2.t, r1.t);
  await conCache(a, 'k', pedir, { ahora: 10 * 60_000, forzar: true });
  await conCache(a, 'k', pedir, { ahora: 50 * 60_000 });
  assert.equal(pedidos, 3);
});

test('conCache: sin almacenamiento (modo privado) pide siempre y no falla', async () => {
  let pedidos = 0;
  const pedir = async () => { pedidos += 1; return 1; };
  await conCache(undefined, 'k', pedir);
  await conCache(undefined, 'k', pedir);
  assert.equal(pedidos, 2);
});

test('conCache: sin conexión usa el último guardado aunque esté vencido, marcado', async () => {
  const a = memoria();
  guardarCache(a, 'k', 'viejo', 0);
  const r = await conCache(a, 'k', async () => { throw new Error('sin red'); }, { ahora: 5 * 3600_000 });
  assert.equal(r.datos, 'viejo');
  assert.equal(r.vencido, true);
  assert.equal(r.t, 0);
});

test('conCache: si la petición falla, el error sube y no se guarda nada', async () => {
  const a = memoria();
  await assert.rejects(() => conCache(a, 'k', async () => { throw new Error('sin red'); }), /sin red/);
  assert.equal(leerCache(a, 'k'), null);
});
