// Servicio mínimo que refresca los datos cuando alguien abre la página: GET /api/actualizar.
// Escucha solo en 127.0.0.1 (nginx le pasa esa ruta). No recibe ningún dato del cliente: ni parámetros ni cuerpo.
// Si el dato tiene menos de 3 h no hace nada; si hay una actualización en curso, todos esperan la misma.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decidir } from './refresco.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DHN = path.join(RAIZ, 'data', 'dhn.json');
const SCRIPT = path.join(RAIZ, 'deploy', 'vps', 'actualizar.sh');
const PUERTO = Number(process.env.PUERTO ?? 8091);

let enCurso = null;
let ultimoFallo = null;

function generadoEn() {
  try {
    return JSON.parse(fs.readFileSync(DHN, 'utf8')).generadoEn ?? null;
  } catch {
    return null;
  }
}

function correr() {
  return new Promise((resolve) => {
    execFile('/bin/bash', [SCRIPT], { timeout: 120_000, env: { PATH: '/usr/local/bin:/usr/bin:/bin' } }, (error) => {
      if (error) ultimoFallo = Date.now();
      else ultimoFallo = null;
      resolve(!error);
    });
  });
}

async function actualizar() {
  const d = decidir({ generadoEn: generadoEn(), ahora: Date.now(), ultimoFallo });
  if (!d.actualizar) return { actualizado: false, razon: d.razon, generadoEn: generadoEn() };
  enCurso ??= correr().finally(() => { enCurso = null; });
  const ok = await enCurso;
  return { actualizado: ok, razon: ok ? d.razon : 'fallo', generadoEn: generadoEn() };
}

http.createServer(async (req, res) => {
  const cabeceras = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (req.method !== 'GET' || req.url.split('?')[0] !== '/api/actualizar') {
    res.writeHead(404, cabeceras).end('{}');
    return;
  }
  try {
    res.writeHead(200, cabeceras).end(JSON.stringify(await actualizar()));
  } catch {
    res.writeHead(500, cabeceras).end('{"actualizado":false,"razon":"error"}');
  }
}).listen(PUERTO, '127.0.0.1', () => console.log(`escuchando en 127.0.0.1:${PUERTO}`));
