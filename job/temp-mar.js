// Temperatura reciente del mar por playa → data/temp-mar.json. Fuente principal: NOAA OISST (comparable con el
// clima habitual); si falla, respaldo con Open-Meteo Marine. Es un dato accesorio: si todo falla, el job
// principal no se cae y se conserva el archivo anterior.
import fs from 'node:fs';
import path from 'node:path';
import { pedirCelda } from './oisst.js';
import { pedirOpenMeteo } from './sst-openmeteo.js';

const FUENTES = { oisst: 'NOAA OISST v2.1 (preliminar)', openmeteo: 'Open-Meteo Marine (respaldo)' };
const redondear = (x) => Math.round(x * 10) / 10;

async function medirPlaya(p, { fetchFn, ahora, espera }) {
  const desde = new Date(ahora.getTime() - 45 * 864e5).toISOString().slice(0, 10);
  let fuente = 'oisst';
  let filas;
  try {
    ({ filas } = await pedirCelda({ lat: p.lat, lon: p.lon, desde, reciente: true, fetchFn, espera }));
  } catch (errorNoaa) {
    try {
      filas = await pedirOpenMeteo({ lat: p.lat, lon: p.lon, ahora, fetchFn });
      fuente = 'openmeteo';
      console.warn(`${p.id}: NOAA falló (${errorNoaa.message}); uso Open-Meteo.`);
    } catch (errorRespaldo) {
      throw new Error(`${errorNoaa.message}; respaldo: ${errorRespaldo.message}`);
    }
  }
  const ultima = filas[filas.length - 1];
  return { fecha: ultima.fecha, actual: redondear(ultima.sst), fuente, serie: filas.map((f) => [f.fecha, redondear(f.sst)]) };
}

export async function construirTempMar(playas, { fetchFn = fetch, ahora = new Date(), espera = 5000 } = {}) {
  const resultado = {};
  for (const p of playas) resultado[p.id] = await medirPlaya(p, { fetchFn, ahora, espera });
  const usadas = new Set(Object.values(resultado).map((v) => v.fuente));
  return { generadoEn: ahora.toISOString(), fuente: [...usadas].map((f) => FUENTES[f]).join(' + '), playas: resultado };
}

export async function escribirTempMar(playas, destino, opciones) {
  try {
    const datos = await construirTempMar(playas, opciones);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(datos)}\n`);
    console.log(`temp-mar.json escrito: ${Object.entries(datos.playas).map(([k, v]) => `${k} ${v.actual} °C (${v.fecha}, ${v.fuente})`).join(', ')}`);
  } catch (e) {
    console.warn(`No pude actualizar la temperatura del mar (se conserva la anterior): ${e.message}`);
  }
}
