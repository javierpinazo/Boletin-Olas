// Arma _site/ (lo que sirve nginx o publica GitHub Pages): site/ + data/dhn.json.
// Se arma en una carpeta temporal y se cambia de lugar con dos renombrados, así quien esté sirviendo
// _site/ (nginx cada hora) nunca ve una carpeta a medio copiar; si algo falla, queda la versión anterior.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function armarSitio(raiz) {
  const salida = path.join(raiz, '_site');
  const nueva = path.join(raiz, '_site.nuevo');
  const vieja = path.join(raiz, '_site.viejo');
  const dhn = path.join(raiz, 'data', 'dhn.json');

  fs.rmSync(nueva, { recursive: true, force: true });
  try {
    fs.cpSync(path.join(raiz, 'site'), nueva, { recursive: true });
    if (fs.existsSync(dhn)) {
      fs.mkdirSync(path.join(nueva, 'data'), { recursive: true });
      fs.copyFileSync(dhn, path.join(nueva, 'data', 'dhn.json'));
    }
  } catch (e) {
    fs.rmSync(nueva, { recursive: true, force: true });
    throw e;
  }

  fs.rmSync(vieja, { recursive: true, force: true });
  if (fs.existsSync(salida)) fs.renameSync(salida, vieja);
  fs.renameSync(nueva, salida);
  fs.rmSync(vieja, { recursive: true, force: true });
  return { salida, conDhn: fs.existsSync(dhn) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { conDhn } = armarSitio(raiz);
  console.log(`_site listo (${conDhn ? 'con' : 'sin'} data/dhn.json)`);
}
