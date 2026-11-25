import test from 'node:test';
import assert from 'node:assert/strict';
import { textoResumen, enlaceWhatsapp } from '../site/js/compartir.js';

const datos = {
  fecha: 'miércoles, 25 nov.',
  titular: 'Hoy se rema\ncon cuidado',
  mejor: 'Yuyos, 9–17 h',
  oleaje: { texto: 'Medio', color: 'amarillo' },
  mar: { actual: '24,6', dif: '+6,8 °C' },
  playas: [{ nombre: 'Yuyos', color: 'amarillo', estado: '9–17 h', ola: '0,6 m', viento: '15 km/h', rafaga: '36 km/h' }],
  luna: { nombre: 'Luna llena', p: 0.5 },
  url: 'https://olaspaddle.duckdns.org',
  firma: { texto: 'Soluciones: Automatizate 360', url: 'https://ejemplo.pe' },
};

test('textoResumen: solo el veredicto y los enlaces (lo demás va en la imagen)', () => {
  assert.equal(textoResumen(datos), [
    'Boletín Olas, miércoles, 25 nov.: hoy se rema con cuidado. Mejor opción: Yuyos, 9–17 h.',
    'Detalle hora a hora: https://olaspaddle.duckdns.org',
    'Soluciones: Automatizate 360 · https://ejemplo.pe',
  ].join('\n'));
});

test('textoResumen: sin mejor opción ni enlace de la firma', () => {
  const t = textoResumen({ ...datos, titular: 'Hoy no\nconviene remar', mejor: null, firma: { texto: 'Soluciones: Automatizate 360', url: null } });
  assert.equal(t, [
    'Boletín Olas, miércoles, 25 nov.: hoy no conviene remar.',
    'Detalle hora a hora: https://olaspaddle.duckdns.org',
    'Soluciones: Automatizate 360',
  ].join('\n'));
});

test('enlaceWhatsapp: abre wa.me con el texto codificado', () => {
  const url = enlaceWhatsapp(datos);
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(decodeURIComponent(url.split('text=')[1]), textoResumen(datos));
});
