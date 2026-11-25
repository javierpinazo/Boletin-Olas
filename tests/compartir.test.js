import test from 'node:test';
import assert from 'node:assert/strict';
import { textoResumen, enlaceWhatsapp } from '../site/js/compartir.js';

const datos = {
  fecha: 'miércoles, 25 nov',
  titular: 'Hoy sí\nse rema',
  playas: [{ nombre: 'Yuyos', color: 'verde', texto: '7–11 h' }, { nombre: 'San Bartolo', color: 'rojo', texto: 'No apto' }],
  pie: 'Mar 25,1 °C · Luna llena',
  url: 'https://olaspaddle.duckdns.org',
};

test('textoResumen: fecha, titular, una línea por playa, pie y enlace', () => {
  assert.equal(textoResumen(datos), [
    'Boletín Olas · miércoles, 25 nov',
    'Hoy sí\nse rema',
    '• Yuyos: 7–11 h',
    '• San Bartolo: No apto',
    'Mar 25,1 °C · Luna llena',
    'https://olaspaddle.duckdns.org',
  ].join('\n'));
});

test('textoResumen: omite el pie si no hay datos de mar ni luna', () => {
  assert.doesNotMatch(textoResumen({ ...datos, pie: '' }), /\n\n/);
});

test('enlaceWhatsapp: abre wa.me con el texto codificado', () => {
  const url = enlaceWhatsapp(datos);
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(decodeURIComponent(url.split('text=')[1]), textoResumen(datos));
});
