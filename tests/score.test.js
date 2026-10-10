import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso } from '../job/parse-aviso.js';
import { parseTsunami } from '../job/parse-tsunami.js';
import {
  colorAltura, colorPeriodo, colorViento, colorDhn, tramoParaPlaya, nivelEn, estadoDhn,
  evaluarHora, evaluarPlayaDia, mejorPlaya, evaluarTsunami, estadoDia, resultadoSinMar, alertaOleaje, resumenOleajeDia, gradoMar, ETIQUETA_GRADO, COLOR_GRADO,
} from '../site/js/score.js';

const FX = new URL('./fixtures/', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
const u = config.umbrales;
// Los tests de umbrales usan la ola del modelo tal cual (factor 1); el factor real se prueba aparte.
const playa = (id) => ({ ...config.playas.find((p) => p.id === id), factorOla: 1 });
const aviso39 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[0]);

test('altura: límites exactos', () => {
  assert.equal(colorAltura(0.8, u).color, 'verde');
  assert.equal(colorAltura(0.81, u).color, 'amarillo');
  assert.equal(colorAltura(1.3, u).color, 'amarillo');
  assert.equal(colorAltura(1.31, u).color, 'rojo');
});

test('periodo: largo solo importa si hay olas', () => {
  assert.equal(colorPeriodo(18, 0.5, u).color, 'verde');
  assert.equal(colorPeriodo(12, 0.7, u).color, 'verde');
  assert.equal(colorPeriodo(13, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.9, u).color, 'rojo');
});

test('viento: límites y terral más estricto', () => {
  assert.equal(colorViento(12, 200, u).color, 'verde');
  assert.equal(colorViento(13, 200, u).color, 'amarillo');
  assert.equal(colorViento(21, 200, u).color, 'rojo');
  assert.equal(colorViento(8, 90, u).color, 'verde');
  assert.equal(colorViento(9, 90, u).color, 'amarillo');
  assert.equal(colorViento(16, 90, u).color, 'rojo');
  assert.equal(colorViento(9, 19, u).color, 'verde', '19° ya no es terral, 9 km/h < 12');
  assert.equal(colorViento(9, 20, u).color, 'amarillo', '20° es terral');
  assert.equal(colorViento(9, 160, u).color, 'amarillo', '160° es terral');
  assert.equal(colorViento(9, 161, u).color, 'verde');
});

test('dhn: niveles y desconocido', () => {
  assert.equal(colorDhn('normal').color, 'verde');
  assert.equal(colorDhn('ligero').color, 'verde');
  assert.equal(colorDhn('moderado').color, 'amarillo');
  assert.equal(colorDhn('fuerte').color, 'rojo');
  assert.equal(colorDhn('muy fuerte').color, 'rojo');
  assert.equal(colorDhn(null).color, 'amarillo');
});

test('tramo: La Punta va en "hasta Callao"; las otras tres "al sur de Callao"', () => {
  assert.match(tramoParaPlaya(playa('la-punta'), aviso39).nombre, /Salaverry hasta Callao/);
  for (const id of ['san-bartolo', 'punta-hermosa', 'yuyos']) {
    assert.match(tramoParaPlaya(playa(id), aviso39).nombre, /Callao hasta San Juan de Marcona/);
  }
});

test('tramo: con el aviso 38 (límite en Chancay) todas caen al sur de Chancay', () => {
  const aviso38 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[1]);
  for (const p of config.playas) {
    assert.match(tramoParaPlaya(p, aviso38).nombre, /Chancay hasta San Juan de Marcona/);
  }
});

test('tramo: playa fuera de los tramos conocidos -> null', () => {
  assert.equal(tramoParaPlaya({ lat: -25, lon: -70 }, aviso39), null);
  assert.equal(tramoParaPlaya(playa('yuyos'), null), null);
});

test('nivelEn sigue la línea de tiempo y vence con el aviso', () => {
  const t = tramoParaPlaya(playa('yuyos'), aviso39);
  assert.equal(nivelEn(t, aviso39, '2026-10-06T10:00:00-05:00'), 'normal');
  assert.equal(nivelEn(t, aviso39, '2026-10-07T13:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T11:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T12:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-12T23:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-13T00:00:00-05:00'), null);
});

test('estadoDhn', () => {
  const ahora = Date.parse('2026-10-09T15:00:00Z');
  assert.equal(estadoDhn(null, ahora, u), 'ausente');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z' }, ahora, u), 'ok');
  assert.equal(estadoDhn({ generadoEn: '2026-10-07T10:31:00Z' }, ahora, u), 'obsoleto');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z', parseError: true }, ahora, u), 'errorParseo');
});

test('evaluarHora: el peor factor manda y datos faltantes no dan verde', () => {
  const ctx = { umbrales: u, nivelDhn: 'ligero', estado: 'ok', tsunamiAlerta: false };
  const bueno = { hora: '2026-10-09T07:00', hs: 0.5, tp: 9, vientoKmh: 6, dirViento: 200 };
  assert.equal(evaluarHora(bueno, ctx).color, 'verde');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: 25 }, ctx).color, 'rojo');
  assert.equal(evaluarHora({ ...bueno, hs: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, nivelDhn: 'moderado' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, estado: 'obsoleto' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, tsunamiAlerta: true }).color, 'rojo');
});

function dia(valores) {
  return valores.map(([h, hs, tp, v, dir]) => ({
    hora: `2026-10-09T${String(h).padStart(2, '0')}:00`, hs, tp, vientoKmh: v, dirViento: dir,
  }));
}
const dhn = { generadoEn: '2026-10-09T10:31:00Z', parseError: false, aviso: aviso39 };
const ahoraMs = Date.parse('2026-10-09T12:00:00Z');
const evaluar = (id, horasCrudas, extra = {}) =>
  evaluarPlayaDia({ playa: playa(id), horasCrudas, aviso: aviso39, dhn, ahoraMs, config, ...extra });

test('playa-día: bloque verde de la mañana y el viento rompe la tarde', () => {
  const r = evaluar('yuyos', dia([
    [12, 0.5, 9, 5, 200], [13, 0.5, 9, 6, 200], [14, 0.5, 9, 7, 200],
    [15, 0.5, 9, 14, 200], [16, 0.5, 9, 18, 200],
  ]));
  assert.equal(r.color, 'verde');
  assert.deepEqual([r.bloque.desde, r.bloque.hasta], [12, 15]);
  assert.match(r.motivo, /^Verde 12–15 h\. Luego: viento de 14 km\/h/);
});

test('playa-día: una hora verde aislada no cuenta como bloque', () => {
  const r = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 25, 200], [14, 0.5, 9, 5, 200]]));
  assert.equal(r.bloque, null);
  assert.equal(r.color, 'rojo');
  assert.match(r.motivo, /^No apto/);
});

test('playa-día: sin verde de 2 h pero con amarillo contiguo -> amarillo', () => {
  const r = evaluar('yuyos', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200]]));
  assert.equal(r.color, 'amarillo');
  assert.equal(r.bloque.hasta - r.bloque.desde, 3);
});

test('playa-día: sin horas en la ventana -> estado sin-horas (no es un veredicto del mar)', () => {
  const r = evaluar('yuyos', []);
  assert.equal(r.estado, 'sin-horas');
  assert.equal(r.bloque, null);
  assert.equal(r.motivo, 'No quedan horas dentro de la ventana de este día');
});

test('playa-día: el DHN moderado limita a amarillo aunque el mar esté plano', () => {
  const r = evaluar('yuyos', dia([[8, 0.4, 8, 3, 200], [9, 0.4, 8, 3, 200]]).map((h) => ({ ...h, hora: h.hora.replace('10-09', '10-08') })));
  assert.equal(r.color, 'amarillo', 'el 8/10 el tramo está en moderado');
});

test('playa-día: tsunami fuerza rojo', () => {
  const r = evaluar('yuyos', dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]), { tsunamiAlerta: true });
  assert.equal(r.color, 'rojo');
});

test('playa-día: sin aviso DHN -> tope amarillo y nota', () => {
  const r = evaluarPlayaDia({
    playa: playa('yuyos'), horasCrudas: dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]),
    aviso: null, dhn: null, ahoraMs, config,
  });
  assert.equal(r.color, 'amarillo');
  assert.ok(r.notas.length > 0);
});

test('mejorPlaya prefiere verde y luego bloque más largo', () => {
  const a = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200]]));
  const b = evaluar('la-punta', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200], [14, 0.5, 9, 5, 200]]));
  const c = evaluar('san-bartolo', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200], [15, 0.9, 9, 5, 200]]));
  assert.equal(mejorPlaya([a, b, c]).playa.id, 'la-punta');
  assert.equal(mejorPlaya([c]).playa.id, 'san-bartolo');
  assert.equal(mejorPlaya([evaluar('yuyos', [])]), null);
});

test('tsunami: sin riesgo es informativo; el boletín de mayor versión del evento manda', () => {
  const [b2, b1] = separarItems(fs.readFileSync(new URL('tsunami.html', FX), 'utf8')).map(parseTsunami);
  const ahora = Date.parse('2026-10-09T20:00:00Z');
  assert.equal(b1.generaTsunamiEnPeru, true, 'el -1 solo "intensifica vigilancia"');
  const r = evaluarTsunami([b1, b2], ahora);
  assert.equal(r.estado, 'informativo');
  assert.equal(r.boletin.numero, '28-2026-2');
});

test('tsunami: alerta reciente -> alerta; vieja -> ninguno; texto raro -> alerta', () => {
  const base = { evento: '30-2026', version: 1, fechaLocal: '2026-10-09T10:00:00-05:00', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-11T20:00:00Z')).estado, 'ninguno');
  assert.equal(evaluarTsunami([{ ...base, fechaLocal: null }], Date.parse('2026-10-11T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([], 0).estado, 'ninguno');
});

test('tsunami: sin fechaLocal vale vistoEn (24 h)', () => {
  const b = { evento: '31-2026', version: 5, fechaLocal: null, vistoEn: '2026-10-09T10:00:00Z', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-10T20:00:00Z')).estado, 'ninguno');
});

test('playa-día: queda una sola hora -> pocas-horas, no "No apto: olas de 0,5 m"', () => {
  const r = evaluar('yuyos', dia([[16, 0.4, 8, 3, 200]]));
  assert.equal(r.estado, 'pocas-horas');
  assert.equal(r.bloque, null);
  assert.equal(r.motivo, 'Queda menos de 2 horas dentro de la ventana');
});

test('playa-día: con bloque el estado es ok', () => {
  assert.equal(evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200]])).estado, 'ok');
});

test('playa-día: sin bloque, el motivo es la causa roja y no una razón verde', () => {
  const r = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 25, 200], [14, 0.5, 9, 5, 200]]));
  assert.equal(r.estado, 'ok');
  assert.match(r.motivo, /^No apto: viento de 25 km\/h/);
});

test('playa-día: aviso vencido -> tope amarillo y nota con la fecha de vencimiento', () => {
  const horas = dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]).map((h) => ({ ...h, hora: h.hora.replace('10-09', '10-13') }));
  const r = evaluar('yuyos', horas);
  assert.equal(r.color, 'amarillo');
  assert.ok(r.notas.some((n) => /venció el 12\/10/.test(n)), JSON.stringify(r.notas));
});

test('resultadoSinMar: estado sin-mar', () => {
  const r = resultadoSinMar(playa('yuyos'));
  assert.equal(r.estado, 'sin-mar');
  assert.equal(r.bloque, null);
  assert.equal(r.motivo, 'No pude obtener el mar ahora');
});

test('estadoDia: todas sin mar -> sin-mar', () => {
  assert.equal(estadoDia(config.playas.map(resultadoSinMar)).tipo, 'sin-mar');
});

test('estadoDia: ninguna playa con horas suficientes -> sin-horas aunque otra no tenga mar', () => {
  const rs = [resultadoSinMar(playa('yuyos')), evaluar('san-bartolo', []), evaluar('la-punta', dia([[16, 0.4, 8, 3, 200]]))];
  assert.equal(estadoDia(rs).tipo, 'sin-horas');
});

test('estadoDia: con mejor playa -> mejor; con horas pero todo rojo -> ninguna', () => {
  const bueno = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200]]));
  const malo = evaluar('la-punta', dia([[12, 2, 9, 5, 200], [13, 2, 9, 5, 200]]));
  assert.equal(estadoDia([bueno, malo]).tipo, 'mejor');
  assert.equal(estadoDia([bueno, malo]).mejor.playa.id, 'yuyos');
  assert.equal(estadoDia([malo]).tipo, 'ninguna');
});

test('alertaOleaje: nivel fuerte o muy fuerte del DHN en alguna hora -> alerta con el nivel', () => {
  const avisoFuerte = structuredClone(aviso39);
  avisoFuerte.tramos.forEach((t) => { t.linea = [{ nivel: 'fuerte', desde: '2026-10-07T00:00:00-05:00' }]; });
  const r = evaluarPlayaDia({ playa: playa('yuyos'), horasCrudas: dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]), aviso: avisoFuerte, dhn: { ...dhn, aviso: avisoFuerte }, ahoraMs, config });
  assert.deepEqual(alertaOleaje([r]), { nivel: 'fuerte' });
  avisoFuerte.tramos.forEach((t) => { t.linea = [{ nivel: 'muy fuerte', desde: '2026-10-07T00:00:00-05:00' }]; });
  const r2 = evaluarPlayaDia({ playa: playa('yuyos'), horasCrudas: dia([[12, 0.4, 8, 3, 200]]), aviso: avisoFuerte, dhn: { ...dhn, aviso: avisoFuerte }, ahoraMs, config });
  assert.deepEqual(alertaOleaje([r2]), { nivel: 'muy fuerte' });
});

test('alertaOleaje: con ligero o moderado no hay alerta', () => {
  const r = evaluar('yuyos', dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]));
  assert.equal(alertaOleaje([r]), null);
  assert.equal(alertaOleaje([resultadoSinMar(playa('yuyos'))]), null);
});

// ---------- Oleaje anómalo del DHN (Leve / Medio / Alto) ----------

const ventana = config.ventana;
const resumen = (fecha, avisoUsado = aviso39, playas = config.playas) =>
  resumenOleajeDia({ aviso: avisoUsado, playas, fecha, ventana });
const grupoDe = (r, nombrePlaya) => r.grupos.find((g) => g.playas.includes(nombrePlaya));

test('oleaje DHN: el 9/10 baja de Medio a Leve a las 12 h (La Punta y el sur comparten horario)', () => {
  const r = resumen('2026-10-09');
  assert.deepEqual(grupoDe(r, 'Yuyos').segmentos, [
    { desde: 6, hasta: 12, nivel: 'moderado' },
    { desde: 12, hasta: 17, nivel: 'ligero' },
  ]);
  assert.equal(grupoDe(r, 'Yuyos').texto, 'Medio hasta las 12 h, luego Leve');
  assert.equal(grupoDe(r, 'Yuyos').nivelMax, 'moderado');
  assert.equal(grupoDe(r, 'La Punta').texto, 'Medio hasta las 12 h, luego Leve');
});

test('oleaje DHN: La Punta y las otras tres van en grupos distintos (tramos distintos)', () => {
  const r = resumen('2026-10-09');
  assert.equal(r.grupos.length, 2);
  assert.deepEqual(grupoDe(r, 'San Bartolo').playas, ['San Bartolo', 'Punta Hermosa', 'Yuyos']);
  assert.deepEqual(grupoDe(r, 'La Punta').playas, ['La Punta']);
});

test('oleaje DHN: un día entero en un solo nivel', () => {
  const g = grupoDe(resumen('2026-10-08'), 'Yuyos');
  assert.deepEqual(g.segmentos, [{ desde: 6, hasta: 17, nivel: 'moderado' }]);
  assert.equal(g.texto, 'Medio de 6 a 17 h');
  const leve = grupoDe(resumen('2026-10-11'), 'Yuyos');
  assert.equal(leve.texto, 'Leve de 6 a 17 h');
  assert.equal(leve.nivelMax, 'ligero');
});

test('oleaje DHN: fuerte y muy fuerte son Alto; muy fuerte se aclara', () => {
  const a = structuredClone(aviso39);
  a.tramos.forEach((t) => { t.linea = [{ nivel: 'fuerte', desde: '2026-10-07T00:00:00-05:00' }, { nivel: 'muy fuerte', desde: '2026-10-09T10:00:00-05:00' }]; });
  const g = grupoDe(resumen('2026-10-09', a), 'Yuyos');
  assert.equal(g.texto, 'Alto hasta las 10 h, luego Alto (muy fuerte)');
  assert.equal(g.nivelMax, 'muy fuerte');
});

test('oleaje DHN: tres niveles seguidos', () => {
  const a = structuredClone(aviso39);
  a.tramos.forEach((t) => { t.linea = [{ nivel: 'ligero', desde: '2026-10-07T00:00:00-05:00' }, { nivel: 'moderado', desde: '2026-10-09T09:00:00-05:00' }, { nivel: 'ligero', desde: '2026-10-09T14:00:00-05:00' }]; });
  assert.equal(grupoDe(resumen('2026-10-09', a), 'Yuyos').texto, 'Leve hasta las 9 h, luego Medio hasta las 14 h, luego Leve');
});

test('oleaje DHN: antes del primer punto del aviso es Normal', () => {
  const g = grupoDe(resumen('2026-10-06'), 'Yuyos');
  assert.equal(g.texto, 'Normal de 6 a 17 h');
  assert.equal(g.nivelMax, 'normal');
});

test('oleaje DHN: aviso vencido -> "Sin aviso vigente del DHN", sin inventar Normal', () => {
  const g = grupoDe(resumen('2026-10-13'), 'Yuyos');
  assert.equal(g.texto, 'Sin aviso vigente del DHN');
  assert.equal(g.nivelMax, null);
});

test('oleaje DHN: sin aviso -> null; playa fuera de los tramos -> grupo sin tramo', () => {
  assert.equal(resumen('2026-10-09', null), null);
  const r = resumen('2026-10-09', aviso39, [{ nombre: 'Lejana', lat: -25, lon: -70 }]);
  assert.equal(r.grupos[0].tramo, null);
  assert.equal(r.grupos[0].texto, 'Esta playa no aparece en los tramos del aviso');
  assert.equal(r.grupos[0].nivelMax, null);
});

// ---------- Escala del mar: calmo / algo / movido / agitado ----------

test('gradoMar: cortes 0,8 / 1,3 / 2,0 m', () => {
  assert.equal(gradoMar(0.8, u), 'calmo');
  assert.equal(gradoMar(0.81, u), 'algo');
  assert.equal(gradoMar(1.3, u), 'algo');
  assert.equal(gradoMar(1.31, u), 'movido');
  assert.equal(gradoMar(2.0, u), 'movido');
  assert.equal(gradoMar(2.01, u), 'agitado');
});

test('escala: etiquetas y colores (rojo reservado para lo muy alto)', () => {
  assert.deepEqual(
    ['calmo', 'algo', 'movido', 'agitado'].map((g) => [ETIQUETA_GRADO[g], COLOR_GRADO[g]]),
    [['Mar calmo', 'verde'], ['Mar con algo de olas', 'amarillo'], ['Mar movido', 'naranja'], ['Mar muy agitado', 'rojo']],
  );
});

const constante = (hs, horas = [12, 13, 14]) => dia(horas.map((h) => [h, hs, 8, 3, 200]));

test('playa-día: olas de 1,5 m con DHN leve -> Mar movido (naranja), con la causa explicada', () => {
  const r = evaluar('yuyos', constante(1.5));
  assert.equal(r.grado, 'movido');
  assert.equal(r.hsMedia, 1.5);
  assert.equal(r.causa, 'Olas de 1,5 m según el modelo; para mar calmo conviene menos de 0,8 m');
});

test('playa-día: el grado usa la altura media de las horas evaluadas', () => {
  const r = evaluar('yuyos', dia([[12, 1.4, 8, 3, 200], [13, 1.6, 8, 3, 200]]));
  assert.equal(r.hsMedia, 1.5);
  assert.equal(evaluar('yuyos', constante(0.5)).grado, 'calmo');
  assert.equal(evaluar('yuyos', constante(2.5)).grado, 'agitado');
});

test('playa-día: tsunami u oleaje Alto del DHN llevan el grado a agitado (rojo) aunque el mar esté plano', () => {
  const t = evaluar('yuyos', constante(0.4), { tsunamiAlerta: true });
  assert.equal(t.grado, 'agitado');
  assert.equal(t.causa, 'Alerta de sismo/tsunami del DHN');
  const a = structuredClone(aviso39);
  a.tramos.forEach((tr) => { tr.linea = [{ nivel: 'fuerte', desde: '2026-10-07T00:00:00-05:00' }]; });
  const d = evaluarPlayaDia({ playa: playa('yuyos'), horasCrudas: constante(0.4), aviso: a, dhn: { ...dhn, aviso: a }, ahoraMs, config });
  assert.equal(d.grado, 'agitado');
  assert.equal(d.causa, 'Oleaje Alto según el DHN');
});

test('playa-día: sin horas o sin mar no tienen grado', () => {
  assert.equal(evaluar('yuyos', []).grado, null);
  assert.equal(resultadoSinMar(playa('yuyos')).grado, null);
});

test('playa-día: sin dato de ola no inventa grado', () => {
  const r = evaluar('yuyos', dia([[12, null, null, 3, 200], [13, null, null, 3, 200]]));
  assert.equal(r.grado, null);
  assert.equal(r.hsMedia, null);
});

test('estadoDia ninguna: describe el mar con el grado y la causa de la mejor playa', () => {
  const movido = evaluar('yuyos', constante(1.5));
  const agitado = evaluar('la-punta', constante(2.4));
  const e = estadoDia([agitado, movido]);
  assert.equal(e.tipo, 'ninguna');
  assert.equal(e.grado, 'movido');
  assert.equal(e.causa, 'Olas de 1,5 m según el modelo; para mar calmo conviene menos de 0,8 m');
});

test('estadoDia ninguna: con olas calmas pero sin bloque la causa es el motivo (p. ej. el viento)', () => {
  const ventoso = evaluar('yuyos', dia([[12, 0.5, 8, 25, 200], [13, 0.5, 8, 25, 200]]));
  const e = estadoDia([ventoso]);
  assert.equal(e.tipo, 'ninguna');
  assert.equal(e.grado, 'calmo');
  assert.equal(e.causa, 'No apto: viento de 25 km/h');
});

// ---------- Factor de ola por playa (el modelo da la ola de mar abierto, no la de la zona tranquila) ----------

const conFactor = (id, factorOla) => ({ ...playa(id), factorOla });
const evaluarFactor = (p, horas) => evaluarPlayaDia({ playa: p, horasCrudas: horas, aviso: aviso39, dhn, ahoraMs, config });
const horasModelo = (hs) => dia([12, 13, 14].map((h) => [h, hs, 11.8, 7, 200]));

test('factorOla: 1,6 m del modelo x 0,31 = 0,5 m en la zona tranquila (verde, Mar calmo)', () => {
  const r = evaluarFactor(conFactor('yuyos', 0.31), horasModelo(1.6));
  assert.equal(r.horas[0].dato.hs, 0.5);
  assert.equal(r.horas[0].dato.hsModelo, 1.6);
  assert.equal(r.hsMedia, 0.5);
  assert.equal(r.grado, 'calmo');
  assert.equal(r.color, 'verde');
});

test('factorOla: sin factor vale 1 (la ola del modelo sin corregir)', () => {
  const p = playa('yuyos');
  delete p.factorOla;
  const r = evaluarFactor(p, horasModelo(1.6));
  assert.equal(r.horas[0].dato.hs, 1.6);
  assert.equal(r.grado, 'movido');
});

test('factorOla: un dato de ola faltante sigue faltando (no se inventa 0)', () => {
  const r = evaluarFactor(conFactor('yuyos', 0.31), dia([[12, null, null, 7, 200], [13, null, null, 7, 200]]));
  assert.equal(r.horas[0].dato.hs, null);
  assert.equal(r.hsMedia, null);
  assert.equal(r.grado, null);
});

test('factorOla: la causa dice la ola de tu zona y la del modelo', () => {
  const r = evaluarFactor(conFactor('yuyos', 0.7), horasModelo(1.6));
  assert.equal(r.hsMedia, 1.12);
  assert.equal(r.causa, 'Olas de 1,1 m en tu zona (modelo: 1,6 m); para mar calmo conviene menos de 0,8 m');
});

test('factorOla: no apaga las alertas (tsunami y DHN Alto siguen en rojo aunque la ola corregida sea chica)', () => {
  const t = evaluarPlayaDia({ playa: conFactor('yuyos', 0.31), horasCrudas: horasModelo(1.6), aviso: aviso39, dhn, ahoraMs, config, tsunamiAlerta: true });
  assert.equal(t.grado, 'agitado');
  assert.equal(t.color, 'rojo');
});

test('factorOla: la ola corregida también baja el rojo por periodo largo a amarillo', () => {
  const horas = dia([12, 13].map((h) => [h, 2.4, 16, 7, 200]));
  const periodo = (r) => r.horas[0].razones.find((x) => x.factor === 'periodo').color;
  assert.equal(periodo(evaluarFactor(playa('yuyos'), horas)), 'rojo', 'sin factor: ola 2,4 m con periodo de 16 s');
  assert.equal(periodo(evaluarFactor(conFactor('yuyos', 0.31), horas)), 'amarillo', 'con factor: ola de 0,74 m y periodo largo');
});

test('config: cada playa trae un factorOla razonable (0 < f <= 1,5)', () => {
  for (const p of config.playas) {
    assert.ok(typeof p.factorOla === 'number' && p.factorOla > 0 && p.factorOla <= 1.5, `${p.nombre}: factorOla=${p.factorOla}`);
  }
});
