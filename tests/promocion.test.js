import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerPromocion, enlaceDe, promocionSinAlertas } from '../site/js/promocion.js';

const leer = (r) => fs.readFileSync(new URL(r, import.meta.url), 'utf8');
const config = JSON.parse(leer('../site/config.json'));
const BASE = { activa: true, rotulo: 'Publicidad', titulo: 'T', boton: 'Ver', url: 'https://itsefacil.com/' };

test('enlaceDe: marca de dónde viene la visita', () => {
  assert.equal(enlaceDe(BASE, 'franja'), 'https://itsefacil.com/?utm_source=boletin-olas&utm_medium=franja');
});

test('leerPromocion: apagada, ausente, incompleta o sin https no muestra nada', () => {
  assert.equal(leerPromocion({ promocion: BASE }).titulo, 'T');
  assert.equal(leerPromocion(undefined), null);
  assert.equal(leerPromocion({}), null);
  for (const mal of [{ activa: false }, { rotulo: '' }, { titulo: '' }, { boton: '' }, { url: 'http://x.pe' }, { url: 'javascript:alert(1)' }, { url: undefined }]) {
    assert.equal(leerPromocion({ promocion: { ...BASE, ...mal } }), null, JSON.stringify(mal));
  }
});

test('config: solo ITSE Fácil, identificado como publicidad y sin presentarse como trámite oficial', () => {
  const p = leerPromocion(config);
  assert.match(p.rotulo, /Publicidad/);
  assert.equal(new URL(p.url).hostname, 'itsefacil.com');
  assert.doesNotMatch(p.titulo, /oficial|municipalidad|emitimos|certificado garantizado/i);
  assert.equal(config.promociones, undefined);
});

test('promocionSinAlertas: con cualquier alerta en pantalla la publicidad se oculta', () => {
  assert.equal(promocionSinAlertas('anuncio', [null, null, null]), 'anuncio');
  assert.equal(promocionSinAlertas('anuncio', []), 'anuncio');
  assert.equal(promocionSinAlertas('anuncio', [null, {}, null]), null);
});

test('app.js: las alertas apagan la publicidad; la imagen compartida no la lleva', () => {
  const app = leer('../site/js/app.js');
  assert.match(app, /const alertas = \[tsunami, sinConexion, dhnViejo, oleajeFuerte\];/);
  assert.match(app, /return \[\s*tarjetaPromocion\(promocionSinAlertas\(leerPromocion\(estado\.config\), alertas\)\),\s*tsunami,/);
  assert.doesNotMatch(leer('../site/js/compartir.js'), /promocion|publicidad/i);
});
