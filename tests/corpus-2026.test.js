// Corpus real: los 39 avisos de oleaje de 2026 (01-26 a 39-26, copiados del portal del DHN el
// 2026-10-09). El formato cambia de un aviso a otro; esta prueba exige leerlos todos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso } from '../job/parse-aviso.js';
import { LUGARES } from '../site/js/lugares.js';
import { tramoParaPlaya } from '../site/js/score.js';

const items = separarItems(fs.readFileSync(new URL('./fixtures/avisos-2026.html', import.meta.url), 'utf8'));
const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));

function leerTodos() {
  const leidos = [];
  const fallos = [];
  for (const item of items) {
    try {
      leidos.push({ item, aviso: parseAviso(item) });
    } catch (e) {
      fallos.push(`${item.titulo.replace(/\s+/g, ' ').slice(0, 70)} → ${e.message.slice(0, 120)}`);
    }
  }
  return { leidos, fallos };
}

test('corpus 2026: el fixture trae los 39 avisos', () => {
  assert.equal(items.length, 39);
});

test('corpus 2026: se leen los 39 avisos', () => {
  const { leidos, fallos } = leerTodos();
  assert.deepEqual(fallos, [], `${leidos.length}/39 leídos; fallan:\n${fallos.join('\n')}`);
});

test('corpus 2026: cada aviso tiene tramos con límites conocidos, línea ordenada y validez coherente', () => {
  const { leidos } = leerTodos();
  for (const { aviso } of leidos) {
    const id = aviso.numero;
    assert.ok(aviso.validoDesde <= aviso.validoHasta, `${id}: validez invertida`);
    assert.ok(aviso.tramos.length >= 1, `${id}: sin tramos`);
    for (const t of aviso.tramos) {
      assert.ok(t.desde in LUGARES && t.hasta in LUGARES, `${id}: límite desconocido ${t.desde}/${t.hasta}`);
      assert.ok(t.linea.length >= 1, `${id}: tramo sin línea de tiempo`);
      for (let i = 1; i < t.linea.length; i++) {
        assert.ok(t.linea[i].desde >= t.linea[i - 1].desde, `${id}: línea desordenada`);
      }
    }
  }
});

test('corpus 2026: en cada aviso las 4 playas caen en algún tramo', () => {
  const { leidos } = leerTodos();
  for (const { aviso } of leidos) {
    for (const playa of config.playas) {
      assert.ok(tramoParaPlaya(playa, aviso), `${aviso.numero}: ${playa.nombre} sin tramo`);
    }
  }
});

test('corpus 2026: numeración 01..39 (no existe el 06-26; el 04-26 tiene además una ACTUALIZACIÓN)', () => {
  const { leidos } = leerTodos();
  const numeros = leidos.map(({ aviso }) => Number(aviso.numero.split('-')[0])).sort((a, b) => a - b);
  const esperado = Array.from({ length: 39 }, (_, i) => i + 1).filter((n) => n !== 6);
  esperado.push(4);
  assert.deepEqual(numeros, esperado.sort((a, b) => a - b));
});

test('corpus 2026: el nivel máximo de cada aviso coincide con el análisis independiente del texto', () => {
  const { leidos } = leerTodos();
  const orden = ['ligero', 'moderado', 'fuerte', 'muy fuerte'];
  const dist = {};
  for (const { aviso } of leidos) {
    const max = aviso.tramos.flatMap((t) => t.linea.map((p) => p.nivel)).reduce((a, b) => (orden.indexOf(b) > orden.indexOf(a) ? b : a));
    dist[max] = (dist[max] || 0) + 1;
  }
  assert.deepEqual(dist, { moderado: 17, ligero: 14, fuerte: 7, 'muy fuerte': 1 });
});

test('corpus 2026: 22-26 sube a muy fuerte la noche del domingo 7 de junio', () => {
  const { leidos } = leerTodos();
  const a = leidos.find(({ aviso }) => Number(aviso.numero.split('-')[0]) === 22).aviso;
  const punto = a.tramos.flatMap((t) => t.linea).find((p) => p.nivel === 'muy fuerte');
  assert.equal(punto.desde, '2026-06-07T18:00:00-05:00');
});

test('corpus 2026: 39-26 conserva la lectura validada a mano', () => {
  const { leidos } = leerTodos();
  const a = leidos.find(({ aviso }) => Number(aviso.numero.split('-')[0]) === 39).aviso;
  assert.equal(a.validoHasta, '2026-10-12');
  assert.deepEqual(a.tramos[2].linea, [
    { nivel: 'ligero', desde: '2026-10-07T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-10-07T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-10-09T12:00:00-05:00' },
  ]);
});

test('corpus 2026: ningún punto de la línea de tiempo cae fuera de [emisión, fin de validez + 1 día]', () => {
  const { leidos } = leerTodos();
  const sumar = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  for (const { aviso } of leidos) {
    const tope = sumar(aviso.validoHasta);
    for (const t of aviso.tramos) {
      for (const p of t.linea) {
        const dia = p.desde.slice(0, 10);
        assert.ok(dia >= aviso.emitidoEn && dia <= tope, `${aviso.numero}: ${p.nivel} desde ${p.desde} fuera de ${aviso.emitidoEn}..${tope}`);
      }
    }
  }
});

test('corpus 2026: el tramo en "Condiciones normales" de 36-26 se muestra como Normal (verde) en las playas del sur', () => {
  const { leidos } = leerTodos();
  const a = leidos.find(({ aviso }) => Number(aviso.numero.split('-')[0]) === 36).aviso;
  const yuyos = config.playas.find((p) => p.id === 'yuyos');
  const tramo = tramoParaPlaya(yuyos, a);
  assert.match(tramo.nombre, /Chancay hasta San Juan de Marcona/);
  assert.deepEqual(tramo.linea.map((p) => p.nivel), ['normal']);
});

test('corpus 2026: la validez incluye el horizonte real cuando el título queda corto (24-26 y 15-26)', () => {
  const { leidos } = leerTodos();
  const de = (n) => leidos.find(({ aviso }) => Number(aviso.numero.split('-')[0]) === n).aviso;
  assert.equal(de(24).validoHasta, '2026-06-26');
  assert.equal(de(15).validoHasta, '2026-04-24');
  assert.equal(de(39).validoHasta, '2026-10-12');
});
