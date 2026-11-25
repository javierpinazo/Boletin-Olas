// Servidor estático mínimo para ver _site/ en local: node scripts/serve.mjs [puerto] [--local]
// Los datos del servidor (avisos del DHN, temperatura del mar, grifos) y la actualización al abrir la página se
// piden a la VPS, para ver en local lo mismo que en producción. Con --local se usan los archivos de _site/data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const args = process.argv.slice(2);
const soloLocal = args.includes('--local');
const puerto = Number(args.find((a) => /^\d+$/.test(a)) ?? 8080);
const ORIGEN = process.env.OLAS_ORIGEN ?? 'https://olaspaddle.duckdns.org';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

const esDeServidor = (ruta) => ruta === '/api/actualizar' || /^\/data\/[\w-]+\.json$/.test(ruta);

async function desdeVps(ruta, res) {
  const r = await fetch(`${ORIGEN}${ruta}`, { cache: 'no-store', signal: AbortSignal.timeout(130_000) });
  if (!r.ok) throw new Error(`VPS ${r.status}`);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(Buffer.from(await r.arrayBuffer()));
}

function archivoLocal(ruta, res) {
  const archivo = path.join(raiz, ruta.endsWith('/') ? `${ruta}index.html` : ruta);
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404).end('no encontrado');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(archivo).pipe(res);
}

http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!soloLocal && esDeServidor(ruta)) {
    try {
      await desdeVps(ruta, res);
      return;
    } catch (e) {
      console.warn(`${ruta}: no pude leerlo de la VPS (${e.message}); uso la copia local.`);
      if (ruta === '/api/actualizar') {
        res.writeHead(503).end('{"actualizado":false}');
        return;
      }
    }
  }
  archivoLocal(ruta, res);
}).listen(puerto, () => console.log(`http://localhost:${puerto}  (datos ${soloLocal ? 'locales' : `de ${ORIGEN}`})`));
