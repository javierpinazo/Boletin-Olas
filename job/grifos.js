// Precios de los grifos (Osinergmin, registro SCOP: el mismo que alimenta Facilito) → data/grifos.json.
// Fuente: "Últimos precios registrados en EVPC", un .xlsx público que Osinergmin actualiza a diario. No trae
// coordenadas, así que "en tu ruta" se decide por distrito y por avenidas citadas en la dirección.
import fs from 'node:fs';
import path from 'node:path';
import { leerXlsx } from './xlsx.js';

export const URL_EVPC = 'https://www.osinergmin.gob.pe/seccion/centro_documental/hidrocarburos/SCOP/SCOP-DOCS/2026/Registro-precios/Ultimos-Precios-Registrados-EVPC.xlsx';
const MS_DIA = 86_400_000;

// Fecha de Excel (días desde 1899-12-30, con fracción) → 'YYYY-MM-DD'.
export const fechaExcel = (serie) => new Date(Math.round((Number(serie) - 25569) * MS_DIA)).toISOString().slice(0, 10);

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const redondear = (n) => Math.round(n * 100) / 100;

export function construirGrifos(filas, { config, ahora = new Date() }) {
  const g = config.grifos;
  const producto = norm(g.producto);
  const zonas = g.zonas.map((z) => ({ nombre: z.nombre, distritos: new Set(z.distritos.map(norm)), avenidas: z.avenidas.map(norm) }));
  const maxMs = g.maximoDiasPrecio * MS_DIA;

  // Un grifo por código de Osinergmin; si tiene varias filas del producto, la de registro más reciente.
  const porCodigo = new Map();
  for (const f of filas) {
    if (norm(f.DEPARTAMENTO) !== 'LIMA' || norm(f.PRODUCTO) !== producto || norm(f.PRODUCTO_ACTIVO) === 'NO') continue;
    const precio = Number(f.PRECIO_VENTA);
    if (!(precio > 5 && precio < 80)) continue;
    const fecha = fechaExcel(f.FCHA_REGISTRO);
    const previo = porCodigo.get(f.CODIGO_OSINERG);
    if (previo && previo.fecha >= fecha) continue;
    porCodigo.set(f.CODIGO_OSINERG, {
      id: f.CODIGO_OSINERG, razon: String(f.RAZON).trim(), distrito: String(f.DISTRITO).trim(), provincia: String(f.PROVINCIA).trim(),
      direccion: String(f.DIRECCION).replace(/\s+/g, ' ').trim(), precio: redondear(precio), fecha,
    });
  }
  const todos = [...porCodigo.values()].map((x) => ({
    ...x,
    dias: Math.max(0, Math.round((ahora.getTime() - Date.parse(`${x.fecha}T12:00:00Z`)) / MS_DIA)),
  }));
  const vigentes = todos.filter((x) => x.dias * MS_DIA <= maxMs);
  const barato = (a, b) => a.precio - b.precio || a.dias - b.dias;
  const esLima = (x) => norm(x.provincia) === 'LIMA';
  // Cada grifo cuenta en la primera zona (tramo de la ruta) que lo reclame por distrito o por avenida en la dirección.
  const zonaDe = (x) => zonas.find((z) => z.distritos.has(norm(x.distrito)) || z.avenidas.some((a) => norm(x.direccion).includes(a)));
  const publico = (x) => ({ id: x.id, razon: x.razon, distrito: x.distrito, direccion: x.direccion, precio: x.precio, fecha: x.fecha, dias: x.dias });

  const favoritos = g.favoritos.map((fav) => {
    const x = todos.find((t) => t.id === fav.codigo);
    return x ? { nombre: fav.nombre, ...publico(x) } : { nombre: fav.nombre, id: fav.codigo, sinPrecio: true };
  });
  const precios = vigentes.filter(esLima).map((x) => x.precio).sort((a, b) => a - b);
  const mediana = precios.length ? precios[Math.floor(precios.length / 2)] : null;

  return {
    generadoEn: ahora.toISOString(),
    fuente: 'Osinergmin, últimos precios registrados por los grifos (SCOP/Facilito)',
    producto: g.etiqueta,
    unidad: 'galón',
    medianaLima: mediana,
    favoritos,
    zonas: zonas.map((z) => ({
      nombre: z.nombre,
      grifos: vigentes.filter((x) => esLima(x) && zonaDe(x) === z).sort(barato).slice(0, g.cuantosPorZona).map(publico),
    })),
    lima: vigentes.filter(esLima).sort(barato).slice(0, g.cuantosLima).map(publico),
  };
}

export async function bajarEvpc(fetchFn = fetch) {
  const r = await fetchFn(URL_EVPC, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoletinOlas/1.0)' }, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Osinergmin respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Dato accesorio: si falla, el job principal sigue y se conserva el archivo anterior.
export async function escribirGrifos(config, destino, { fetchFn = fetch, ahora = new Date() } = {}) {
  try {
    const datos = construirGrifos(leerXlsx(await bajarEvpc(fetchFn)), { config, ahora });
    if (!datos.lima.length) throw new Error('El registro no trajo precios de Lima');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(datos)}\n`);
    console.log(`grifos.json escrito: ${datos.favoritos.length} favoritos, ${datos.zonas.reduce((n, z) => n + z.grifos.length, 0)} en ruta, mediana S/ ${datos.medianaLima}`);
  } catch (e) {
    console.warn(`No pude actualizar los precios de grifos (se conserva lo anterior): ${e.message}`);
  }
}
