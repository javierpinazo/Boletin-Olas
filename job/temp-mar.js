// Temperatura reciente del mar por zona de la costa → data/temp-mar.json. Fuente principal: NOAA OISST (comparable
// con el clima habitual); si falla, respaldo con Open-Meteo Marine. Es un dato accesorio: tiene un plazo total, una
// zona que falla conserva su dato anterior y, si todo falla, el job principal no se cae.
import fs from 'node:fs';
import path from 'node:path';
import { pedirCelda } from './oisst.js';
import { pedirOpenMeteo } from './sst-openmeteo.js';

const FUENTES = { oisst: 'NOAA OISST v2.1 (preliminar)', openmeteo: 'Open-Meteo Marine (respaldo)' };
const redondear = (x) => Math.round(x * 10) / 10;
const VIGENCIA_MS = 12 * 3600_000; // el dato es diario
const EN_PARALELO = 4;

// Señal que se aborta a los `ms`; `soltar` libera el temporizador.
function plazo(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { senal: c.signal, soltar: () => clearTimeout(t) };
}

async function deAPocos(lista, n, fn) {
  const cola = [...lista];
  await Promise.all(Array.from({ length: Math.min(n, cola.length) }, async () => {
    while (cola.length) await fn(cola.shift());
  }));
}

function medida(filas, fuente, leidoEn) {
  const ultima = filas[filas.length - 1];
  return { fecha: ultima.fecha, actual: redondear(ultima.sst), fuente, serie: filas.map((f) => [f.fecha, redondear(f.sst)]), leidoEn };
}

export async function construirTempMar(zonas, { fetchFn = fetch, ahora = new Date(), espera = 5000, plazoMs = 60_000, previo = null } = {}) {
  const leidoEn = ahora.toISOString();
  const desde = new Date(ahora.getTime() - 45 * 864e5).toISOString().slice(0, 10);
  const nuevas = {};
  const errores = {};
  const vigente = (z) => {
    const edad = ahora.getTime() - Date.parse(previo?.zonas?.[z.id]?.leidoEn ?? '');
    return edad >= 0 && edad < VIGENCIA_MS;
  };
  const pendientes = zonas.filter((z) => !vigente(z));

  // NOAA dispone de 2/3 del plazo; el resto queda para el respaldo, que se pide todo a la vez.
  const noaa = plazo((plazoMs * 2) / 3);
  const total = plazo(plazoMs);
  try {
    await deAPocos(pendientes, EN_PARALELO, async (z) => {
      try {
        const { filas } = await pedirCelda({ lat: z.lat, lon: z.lon, desde, reciente: true, fetchFn, espera, senal: noaa.senal });
        nuevas[z.id] = medida(filas, 'oisst', leidoEn);
      } catch (e) {
        errores[z.id] = e.message;
      }
    });
    await Promise.all(pendientes.filter((z) => !nuevas[z.id]).map(async (z) => {
      try {
        const filas = await pedirOpenMeteo({ lat: z.lat, lon: z.lon, ahora, fetchFn, senal: total.senal });
        nuevas[z.id] = medida(filas, 'openmeteo', leidoEn);
        console.warn(`${z.id}: NOAA falló (${errores[z.id]}); uso Open-Meteo.`);
      } catch (e) {
        errores[z.id] = `${errores[z.id]}; respaldo: ${e.message}`;
        console.warn(`${z.id}: sin dato nuevo (${errores[z.id]}).`);
      }
    }));
  } finally {
    noaa.soltar();
    total.soltar();
  }

  const resultado = {};
  for (const z of zonas) {
    const dato = nuevas[z.id] ?? previo?.zonas?.[z.id];
    if (dato) resultado[z.id] = dato;
  }
  if (!Object.keys(resultado).length) throw new Error(Object.values(errores)[0] ?? 'No hay zonas que leer');
  const usadas = new Set(Object.values(resultado).map((v) => v.fuente));
  return { generadoEn: leidoEn, fuente: [...usadas].map((f) => FUENTES[f]).join(' + '), zonas: resultado };
}

// Un archivo ausente, ilegible o con el formato antiguo (por playa) cuenta como sin previo.
function leerPrevio(destino) {
  try {
    const datos = JSON.parse(fs.readFileSync(destino, 'utf8'));
    return datos?.zonas ? datos : null;
  } catch {
    return null;
  }
}

export async function escribirTempMar(zonas, destino, opciones = {}) {
  try {
    const datos = await construirTempMar(zonas, { previo: leerPrevio(destino), ...opciones });
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(datos)}\n`);
    console.log(`temp-mar.json escrito: ${Object.entries(datos.zonas).map(([k, v]) => `${k} ${v.actual} °C (${v.fecha}, ${v.fuente})`).join(', ')}`);
  } catch (e) {
    console.warn(`No pude actualizar la temperatura del mar (se conserva la anterior): ${e.message}`);
  }
}
