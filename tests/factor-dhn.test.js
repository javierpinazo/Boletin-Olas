// Yuyos: la zona de paddle está junto a un espigón y un solo factor no reproduce lo que se ve con cada oleaje.
// El factor de ola cambia según el nivel del DHN (alturas observadas por el usuario el 2026-11-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluarPlayaDia } from '../site/js/score.js';
import { factorAprendidoDePlaya, nuevaSalida } from '../site/js/salidas.js';

const leer = (r) => fs.readFileSync(new URL(r, import.meta.url), 'utf8');
const config = JSON.parse(leer('../site/config.json'));
const { playas } = JSON.parse(leer('../site/playas.json'));
const yuyos = playas.find((p) => p.id === 'yuyos');
const FECHA = '2026-10-09';

const avisoCon = (linea, extra = {}) => ({
  numero: '1-26', emitidoEn: FECHA, validoDesde: FECHA, validoHasta: '2026-10-12',
  tramos: [{ nombre: 'Centro', desde: 'chancay', hasta: 'san juan de marcona', desdeExclusivo: true, linea }],
  ...extra,
});
const desde = (nivel, hora = '00', fecha = FECHA) => ({ nivel, desde: `${fecha}T${hora}:00:00-05:00` });
const alDia = { generadoEn: `${FECHA}T10:31:00Z`, parseError: false };
const ahoraMs = Date.parse(`${FECHA}T11:00:00Z`);
const horasDe = (hs, horas = [12, 13], dirOla = 200, fecha = FECHA) => horas.map((h) => ({
  hora: `${fecha}T${h}:00`, hs, tp: 10, dirOla, vientoKmh: 8, dirViento: 200, rafagaKmh: 12,
}));
const evaluar = ({ aviso, dhn = alDia, horasCrudas = horasDe(2), playa = yuyos }) =>
  evaluarPlayaDia({ playa, horasCrudas, aviso, dhn: dhn && { ...dhn, aviso }, ahoraMs, config });
const alturas = (r) => r.horas.map((h) => h.dato.hs);

test('catálogo: solo Yuyos tiene factor por nivel; conserva 0,31 para versiones anteriores en caché', () => {
  assert.deepEqual(yuyos.factorOlaDhn, { normal: 0.34, ligero: 0.58, moderado: 0.73, fuerte: 0.73, 'muy fuerte': 0.73, sinDato: 0.73 });
  assert.equal(yuyos.factorOla, 0.31);
  assert.deepEqual(playas.filter((p) => p.factorOlaDhn).map((p) => p.id), ['yuyos']);
});

test('cada nivel del DHN usa su factor', () => {
  for (const [nivel, esperado] of [['normal', 0.68], ['ligero', 1.16], ['moderado', 1.46], ['fuerte', 1.46], ['muy fuerte', 1.46]]) {
    const r = evaluar({ aviso: avisoCon([desde(nivel)]) });
    assert.deepEqual(alturas(r), [esperado, esperado], nivel);
    assert.equal(r.horas[0].dato.hsModelo, 2);
  }
});

test('con las olas promedio del modelo en cada nivel salen las alturas observadas', () => {
  for (const [nivel, modelo, esperado] of [['normal', 1.47, 0.5], ['ligero', 1.73, 1.0], ['moderado', 2.40, 1.75]]) {
    assert.equal(alturas(evaluar({ aviso: avisoCon([desde(nivel)]), horasCrudas: horasDe(modelo) }))[0], esperado, nivel);
  }
});

test('si el nivel cambia durante el día, el factor cambia a esa hora', () => {
  const r = evaluar({ aviso: avisoCon([desde('ligero'), desde('moderado', '13')]) });
  assert.deepEqual(alturas(r), [1.16, 1.46]);
});

test('opción A: con el DHN al día y sin aviso vigente para la fecha, factor normal, y el semáforo no pasa de amarillo', () => {
  const vencido = avisoCon([desde('ligero', '00', '2026-10-01')], { emitidoEn: '2026-10-01', validoDesde: '2026-10-01', validoHasta: '2026-10-05' });
  for (const fecha of [FECHA, '2026-10-11']) { // hoy y pasado mañana
    const r = evaluar({ aviso: vencido, horasCrudas: horasDe(1.47, [12, 13], 200, fecha) });
    assert.deepEqual(alturas(r), [0.5, 0.5], fecha);
    assert.ok(r.horas.every((h) => h.color !== 'verde'), 'sin aviso vigente no hay verde');
  }
});

test('con los datos del DHN con problemas, factor precavido 0,73', () => {
  const aviso = avisoCon([desde('normal')]);
  const casos = {
    'sin datos': { aviso: null, dhn: null },
    desactualizados: { aviso, dhn: { ...alDia, generadoEn: `${FECHA}T01:00:00Z` } },
    'aviso no leído': { aviso, dhn: { ...alDia, parseError: true } },
    'sin ningún aviso': { aviso: null },
    'la playa no figura en el aviso': { aviso: { ...aviso, tramos: [{ ...aviso.tramos[0], desde: 'tumbes', hasta: 'salaverry', desdeExclusivo: false }] } },
  };
  for (const [nombre, caso] of Object.entries(casos)) assert.deepEqual(alturas(evaluar(caso)), [1.46, 1.46], nombre);
});

test('el factor de dirección se sigue aplicando encima', () => {
  const r = evaluar({ aviso: avisoCon([desde('moderado')]), horasCrudas: horasDe(2, [12, 13], 90) });
  assert.deepEqual(alturas(r), [0.44, 0.44]); // 2 × 0,73 × 0,3
});

test('las playas sin factor por nivel no cambian', () => {
  const hermosa = playas.find((p) => p.id === 'punta-hermosa');
  assert.deepEqual(alturas(evaluar({ aviso: avisoCon([desde('moderado')]), playa: hermosa })), [0.62, 0.62]);
});

test('en Yuyos los registros de olas no reemplazan el factor; en las demás sí', () => {
  const salidas = (playaId) => ['01', '02', '03'].map((d) => nuevaSalida({ playaId, fecha: `2026-10-${d}`, impresion: 'olitas', hsBase: 1.5 }));
  assert.equal(factorAprendidoDePlaya(salidas('yuyos'), yuyos), null);
  assert.deepEqual(factorAprendidoDePlaya(salidas('punta-hermosa'), playas.find((p) => p.id === 'punta-hermosa')), { factor: 0.2, n: 3 });
});

test('app.js usa esa regla y explica el factor por nivel en la tarjeta', () => {
  const app = leer('../site/js/app.js');
  assert.match(app, /const aprendido = factorAprendidoDePlaya\(estado\.salidas, playa\);/);
  assert.match(app, /if \(r\.playa\.factorOlaDhn\) \{/);
});
