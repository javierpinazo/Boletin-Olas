// Arma _site/ (lo que publica GitHub Pages): site/ + data/dhn.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(raiz, '_site');

fs.rmSync(salida, { recursive: true, force: true });
fs.cpSync(path.join(raiz, 'site'), salida, { recursive: true });
const dhn = path.join(raiz, 'data', 'dhn.json');
if (fs.existsSync(dhn)) {
  fs.mkdirSync(path.join(salida, 'data'), { recursive: true });
  fs.copyFileSync(dhn, path.join(salida, 'data', 'dhn.json'));
}
console.log(`_site listo (${fs.existsSync(dhn) ? 'con' : 'sin'} data/dhn.json)`);
