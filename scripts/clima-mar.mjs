// Genera site/clima-mar.json: temperatura "habitual" del mar por zona y día del año (media 1991–2020 de
// NOAA OISST, suavizada ±7 días). Se corre una vez; el clima no cambia de un día para otro.
// Escribe tras cada zona y salta las que ya están: si NOAA falla a medias, se vuelve a lanzar.
// Uso: node scripts/clima-mar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirCelda } from '../job/oisst.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'site', 'clima-mar.json');
const { zonas } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'site', 'playas.json'), 'utf8'));
const dia = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${iso.slice(0, 4)}-01-01T00:00:00Z`)) / 864e5);

let salida = { fuente: 'NOAA OISST v2.1, media 1991-2020', zonas: {} };
try {
  const previo = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
  if (previo.zonas) salida = previo;
} catch { /* se genera desde cero */ }

const fallidas = [];
for (const z of zonas) {
  if (salida.zonas[z.id]) { console.log(`${z.id}: ya estaba`); continue; }
  try {
    const filas = []; let celda;
    for (let a = 1991; a <= 2020; a += 5) {
      const r = await pedirCelda({ lat: z.lat, lon: z.lon, desde: `${a}-01-01`, hasta: `${a + 4}-12-31` });
      celda = r.celda; filas.push(...r.filas);
    }
    const suma = Array(366).fill(0); const n = Array(366).fill(0);
    for (const f of filas) { const d = dia(f.fecha); suma[d] += f.sst; n[d] += 1; }
    const bruta = suma.map((s, i) => (n[i] ? s / n[i] : null));
    salida.zonas[z.id] = bruta.map((_, i) => {
      const v = [];
      for (let d = -7; d <= 7; d += 1) { const x = bruta[(i + d + 366) % 366]; if (x !== null) v.push(x); }
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    });
    fs.writeFileSync(DESTINO, JSON.stringify(salida));
    console.log(`${z.id}: celda ${celda.lat},${celda.lon}, ${filas.length} días, habitual 12-oct = ${salida.zonas[z.id][dia('2026-10-12')]} °C`);
  } catch (e) {
    fallidas.push(z.id);
    console.warn(`${z.id}: falló (${e.message})`);
  }
}
if (fallidas.length) {
  console.warn(`Faltan: ${fallidas.join(', ')}. Vuelve a ejecutarlo.`);
  process.exit(1);
}
console.log(`clima-mar.json completo: ${zonas.length} zonas.`);
