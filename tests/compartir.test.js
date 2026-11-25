import test from 'node:test';
import assert from 'node:assert/strict';
import { textoResumen, enlaceWhatsapp } from '../site/js/compartir.js';

const datos = {
  fecha: 'miércoles, 25 nov',
  titular: 'Hoy se rema\ncon cuidado',
  oleaje: 'Oleaje anómalo medio (DHN): medio de 6 a 17 h',
  mar: 'Mar 24,6 °C (+6,8 °C sobre lo habitual)',
  playas: [
    { nombre: 'Yuyos', color: 'amarillo', texto: 'Con cuidado 9–17 h', detalle: 'ola 0,6 m · viento 15 km/h · ráfagas 36 km/h' },
    { nombre: 'San Bartolo', color: 'gris', texto: 'Sin datos', detalle: null },
  ],
  pie: 'Luna llena',
  url: 'https://olaspaddle.duckdns.org',
};

test('textoResumen: titular en una línea, oleaje del DHN, temperatura y detalle por playa', () => {
  assert.equal(textoResumen(datos), [
    'Boletín Olas · miércoles, 25 nov',
    'Hoy se rema con cuidado',
    'Oleaje anómalo medio (DHN): medio de 6 a 17 h',
    'Mar 24,6 °C (+6,8 °C sobre lo habitual)',
    '• Yuyos: Con cuidado 9–17 h · ola 0,6 m · viento 15 km/h · ráfagas 36 km/h',
    '• San Bartolo: Sin datos',
    'Luna llena',
    'https://olaspaddle.duckdns.org',
  ].join('\n'));
});

test('textoResumen: sin temperatura ni luna no deja líneas vacías', () => {
  assert.doesNotMatch(textoResumen({ ...datos, mar: null, pie: '' }), /\n\n/);
});

test('enlaceWhatsapp: abre wa.me con el texto codificado', () => {
  const url = enlaceWhatsapp(datos);
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(decodeURIComponent(url.split('text=')[1]), textoResumen(datos));
});
