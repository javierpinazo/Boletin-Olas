import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { armarSitio } from '../scripts/build-site.mjs';

function proyecto(dhn = '{"v":1}') {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'olas-'));
  fs.mkdirSync(path.join(raiz, 'site', 'js'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'site', 'index.html'), '<html>v1</html>');
  fs.writeFileSync(path.join(raiz, 'site', 'js', 'app.js'), '//v1');
  if (dhn) {
    fs.mkdirSync(path.join(raiz, 'data'));
    fs.writeFileSync(path.join(raiz, 'data', 'dhn.json'), dhn);
  }
  return raiz;
}

test('armarSitio: copia site/ y data/dhn.json a _site/', () => {
  const raiz = proyecto();
  const r = armarSitio(raiz);
  assert.equal(r.conDhn, true);
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'index.html'), 'utf8'), '<html>v1</html>');
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'js', 'app.js'), 'utf8'), '//v1');
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'data', 'dhn.json'), 'utf8'), '{"v":1}');
});

test('armarSitio: sin data/dhn.json arma igual y lo informa', () => {
  const raiz = proyecto(null);
  assert.equal(armarSitio(raiz).conDhn, false);
  assert.equal(fs.existsSync(path.join(raiz, '_site', 'data')), false);
});

test('armarSitio: reemplaza la versión anterior y no deja carpetas temporales', () => {
  const raiz = proyecto();
  armarSitio(raiz);
  fs.writeFileSync(path.join(raiz, 'site', 'index.html'), '<html>v2</html>');
  fs.writeFileSync(path.join(raiz, 'data', 'dhn.json'), '{"v":2}');
  armarSitio(raiz);
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'index.html'), 'utf8'), '<html>v2</html>');
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'data', 'dhn.json'), 'utf8'), '{"v":2}');
  assert.deepEqual(fs.readdirSync(raiz).filter((n) => n.startsWith('_site')).sort(), ['_site']);
});

test('armarSitio: si falta site/ falla sin tocar el _site que ya estaba sirviéndose', () => {
  const raiz = proyecto();
  armarSitio(raiz);
  fs.rmSync(path.join(raiz, 'site'), { recursive: true });
  assert.throws(() => armarSitio(raiz));
  assert.equal(fs.readFileSync(path.join(raiz, '_site', 'index.html'), 'utf8'), '<html>v1</html>');
  assert.deepEqual(fs.readdirSync(raiz).filter((n) => n.startsWith('_site')).sort(), ['_site']);
});
