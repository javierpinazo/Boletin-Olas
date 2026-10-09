import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso, parsearLinea, AvisoNoEntendido } from '../job/parse-aviso.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('aviso 39-26: validez, emisión, luna y tramos', () => {
  const a = parseAviso(separarItems(leer('avisos-oleaje.html'))[0]);
  assert.equal(a.numero, '39-26');
  assert.equal(a.validoDesde, '2026-10-08');
  assert.equal(a.validoHasta, '2026-10-12');
  assert.equal(a.emitidoEn, '2026-10-07');
  assert.equal(a.faseLunar, 'cuarto menguante');
  assert.equal(a.url, 'https://www.dhn.mil.pe/portal/avisos-especiales/5340');
  assert.deepEqual(
    a.tramos.map((t) => [t.desde, t.hasta, t.desdeExclusivo]),
    [
      ['tumbes', 'salaverry', false],
      ['salaverry', 'callao', true],
      ['callao', 'san juan de marcona', true],
      ['san juan de marcona', 'tacna', true],
    ],
  );
  const sur = a.tramos[2];
  assert.deepEqual(sur.linea, [
    { nivel: 'ligero', desde: '2026-10-07T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-10-07T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-10-09T12:00:00-05:00' },
  ]);
  assert.deepEqual(a.tramos[1].linea[1], { nivel: 'moderado', desde: '2026-10-07T18:00:00-05:00' });
});

test('aviso 38-26: el límite del subtramo está en Chancay y "mismo día" sigue a la fecha previa', () => {
  const a = parseAviso(separarItems(leer('avisos-oleaje.html'))[1]);
  assert.equal(a.numero, '38-26');
  assert.deepEqual(a.tramos.map((t) => t.hasta), ['salaverry', 'chancay', 'san juan de marcona', 'tacna']);
  assert.deepEqual(a.tramos[1].linea, [
    { nivel: 'ligero', desde: '2026-10-06T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-10-06T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-10-08T06:00:00-05:00' },
  ]);
  assert.deepEqual(a.tramos[2].linea[0], { nivel: 'ligero', desde: '2026-10-05T06:00:00-05:00' });
});

test('validez que cruza de mes: "del 30 de setiembre al 01 de octubre"', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 37-26 (Válido del 30 de setiembre al 01 de octubre del 2026)',
    texto: 'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste desde la tarde del miércoles 30 de setiembre.\nCallao, 29 de setiembre 2026',
  });
  assert.equal(a.validoDesde, '2026-09-30');
  assert.equal(a.validoHasta, '2026-10-01');
  assert.deepEqual(a.tramos[0].linea, [{ nivel: 'ligero', desde: '2026-09-30T12:00:00-05:00' }]);
});

test('niveles fuerte y muy fuerte', () => {
  const l = parsearLinea('Arribo de oleaje ligero desde la mañana del lunes 05 de octubre, incrementando a fuerte desde la tarde del mismo día y a muy fuerte desde la noche del martes 06', '2026-10-03');
  assert.deepEqual(l.map((p) => p.nivel), ['ligero', 'fuerte', 'muy fuerte']);
  assert.equal(l[2].desde, '2026-10-06T18:00:00-05:00');
});

test('cláusula sin niveles devuelve null', () => {
  assert.equal(parsearLinea('', '2026-10-03'), null);
});

test('redacción nueva: el aviso se rechaza con AvisoNoEntendido (no inventa datos)', () => {
  const item = separarItems(leer('aviso-redaccion-nueva.html'))[0];
  assert.throws(() => parseAviso(item), AvisoNoEntendido);
});

test('nivel sin momento de inicio (salvo el primero) se rechaza', () => {
  assert.throws(
    () => parsearLinea('oleaje ligero desde el 29, moderado en la noche, ligero desde el 31', '2026-05-28'),
    AvisoNoEntendido,
  );
});

test('día imposible se rechaza', () => {
  assert.throws(() => parsearLinea('oleaje ligero desde el viernes 31', '2026-10-03'), AvisoNoEntendido);
});

test('línea de tiempo desordenada se rechaza', () => {
  assert.throws(
    () => parsearLinea('oleaje ligero desde la tarde del martes 06, moderado desde la mañana del martes 06', '2026-10-03'),
    AvisoNoEntendido,
  );
});
