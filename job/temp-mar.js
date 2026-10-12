// Temperatura reciente del mar por playa (NOAA OISST, último día publicado) → data/temp-mar.json.
// Es un dato accesorio: si falla, el job principal no se cae y se conserva el archivo anterior.
import fs from 'node:fs';
import path from 'node:path';
import { pedirCelda } from './oisst.js';

export async function construirTempMar(playas, { fetchFn = fetch, ahora = new Date() } = {}) {
  const resultado = {};
  for (const p of playas) {
    const { filas } = await pedirCelda({ lat: p.lat, lon: p.lon, hasta: 4, reciente: true, fetchFn });
    const ultima = filas[filas.length - 1];
    resultado[p.id] = { fecha: ultima.fecha, actual: Math.round(ultima.sst * 10) / 10 };
  }
  return { generadoEn: ahora.toISOString(), fuente: 'NOAA OISST v2.1 (preliminar)', playas: resultado };
}

export async function escribirTempMar(playas, destino, opciones) {
  try {
    const datos = await construirTempMar(playas, opciones);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(datos, null, 2)}\n`);
    console.log(`temp-mar.json escrito: ${Object.entries(datos.playas).map(([k, v]) => `${k} ${v.actual} °C (${v.fecha})`).join(', ')}`);
  } catch (e) {
    console.warn(`No pude actualizar la temperatura del mar (se conserva la anterior): ${e.message}`);
  }
}
