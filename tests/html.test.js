import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlATexto, separarItems } from '../job/html.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('htmlATexto convierte <br> en saltos y quita etiquetas y entidades', () => {
  assert.equal(htmlATexto('<div>a&nbsp;b<br />c &amp; d</div>'), 'a b\nc & d');
});

test('separarItems lee id, título y texto de cada aviso', () => {
  const items = separarItems(leer('avisos-oleaje.html'));
  assert.equal(items.length, 2);
  assert.equal(items[0].id, '5340');
  assert.equal(items[0].titulo, 'AVISO ESPECIAL DE OLEAJE NRO. 39-26 (Válido del 08 al 12 de octubre del 2026)');
  assert.match(items[0].texto, /Litoral Norte \(Zona de Tumbes hasta Salaverry\)/);
});

test('htmlATexto decodifica entidades numéricas y de acentos (&#243;, &#xF3;, &oacute;, &ntilde;)', () => {
  assert.equal(htmlATexto('Direcci&#243;n, Direcci&#xF3;n, Direcci&oacute;n, Espa&ntilde;a, &Aacute;REA, &uuml;'), 'Dirección, Dirección, Dirección, España, ÁREA, ü');
});

test('htmlATexto deja intactas las entidades desconocidas', () => {
  assert.equal(htmlATexto('a &foo; b'), 'a &foo; b');
});
