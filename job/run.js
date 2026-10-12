// Descarga el aviso de oleaje y los boletines de sismo/tsunami del DHN y escribe data/dhn.json.
// Uso: node job/run.js   (lo ejecuta GitHub Actions; también sirve a mano)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirDhn } from './construir-dhn.js';
import { escribirTempMar } from './temp-mar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'data', 'dhn.json');
const URL_AVISOS = 'https://www.dhn.mil.pe/portal/avisos-especiales';
const URL_TSUNAMI = 'https://www.dhn.mil.pe/portal/boletin-sismo-tsunami';

async function bajar(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoletinOlas/1.0)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return new TextDecoder('utf-8').decode(await r.arrayBuffer());
}

async function principal() {
  const [htmlAvisos, htmlTsunami] = await Promise.all([bajar(URL_AVISOS), bajar(URL_TSUNAMI)]);
  const previo = fs.existsSync(DESTINO) ? JSON.parse(fs.readFileSync(DESTINO, 'utf8')) : null;
  const dhn = construirDhn({ htmlAvisos, htmlTsunami, previo, ahora: new Date() });
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, `${JSON.stringify(dhn, null, 2)}\n`);
  console.log(
    `dhn.json escrito: aviso ${dhn.aviso?.numero ?? 'ninguno'}, parseError=${dhn.parseError}, ${dhn.tsunami.length} boletín(es) de sismo`,
  );
  if (dhn.parseError) console.warn(`Aviso no entendido: ${dhn.avisoCrudo.motivo}`);
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'site', 'config.json'), 'utf8'));
  await escribirTempMar(config.playas, path.join(RAIZ, 'data', 'temp-mar.json'));
}

principal().catch((e) => {
  console.error(e);
  process.exit(1); // sin escribir: se conserva el dhn.json anterior y Actions avisa por correo
});
