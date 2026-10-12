// Genera site/clima-mar.json: temperatura "habitual" del mar por playa y día del año (media 1991–2020 de
// NOAA OISST, suavizada ±7 días). Se corre una vez; el clima no cambia de un día para otro.
// Uso: node scripts/clima-mar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirCelda, centroCelda } from '../job/oisst.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'site', 'config.json'), 'utf8'));
const dia = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${iso.slice(0, 4)}-01-01T00:00:00Z`)) / 864e5);

const memo = new Map();
const salida = { fuente: 'NOAA OISST v2.1, media 1991-2020', playas: {} };
for (const p of config.playas) {
  const clave = `${centroCelda(p.lat)},${centroCelda(p.lon)}`;
  if (!memo.has(clave)) {
    const filas = []; let celda;
    for (let a = 1991; a <= 2020; a += 5) {
      const r = await pedirCelda({ lat: p.lat, lon: p.lon, desde: `${a}-01-01`, hasta: `${a + 4}-12-31` });
      celda = r.celda; filas.push(...r.filas);
    }
    memo.set(clave, { celda, filas });
  }
  const { celda, filas } = memo.get(clave);
  const suma = Array(366).fill(0); const n = Array(366).fill(0);
  for (const f of filas) { const d = dia(f.fecha); suma[d] += f.sst; n[d] += 1; }
  const bruta = suma.map((s, i) => (n[i] ? s / n[i] : null));
  salida.playas[p.id] = bruta.map((_, i) => {
    const v = [];
    for (let d = -7; d <= 7; d += 1) { const x = bruta[(i + d + 366) % 366]; if (x !== null) v.push(x); }
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  });
  console.log(`${p.id}: celda ${celda.lat},${celda.lon}, ${filas.length} días, habitual 12-oct = ${salida.playas[p.id][dia('2026-10-12')]} °C`);
}
fs.writeFileSync(path.join(RAIZ, 'site', 'clima-mar.json'), JSON.stringify(salida));
