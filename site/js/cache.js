// Caché en el navegador (localStorage) para el uso frecuente: si un dato se pidió hace menos de `maxMs`,
// se usa el guardado y no se vuelve a pedir. Si el almacenamiento no está disponible (modo privado), se pide siempre.
const PREFIJO = 'cache:v1:';

export const MINUTOS_CACHE = 30;
export const MAX_CACHE_MS = MINUTOS_CACHE * 60_000;

export function leerCache(almacen, clave, { maxMs = MAX_CACHE_MS, ahora = Date.now() } = {}) {
  try {
    const crudo = almacen?.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const { t, datos } = JSON.parse(crudo);
    if (typeof t !== 'number' || ahora - t >= maxMs || ahora < t) return null;
    return { t, datos };
  } catch {
    return null;
  }
}

export function guardarCache(almacen, clave, datos, ahora = Date.now()) {
  try {
    almacen?.setItem(PREFIJO + clave, JSON.stringify({ t: ahora, datos }));
    return true;
  } catch {
    return false; // sin espacio o sin almacenamiento: se seguirá pidiendo
  }
}

// Borra el mar guardado de otras selecciones de playas y las claves de la versión anterior, para no llenar el
// almacenamiento (si se llena, dejan de guardarse Mis playas y las salidas).
export function podarCache(almacen, claveMarVigente) {
  try {
    const claves = Array.from({ length: almacen?.length ?? 0 }, (_, i) => almacen.key(i));
    for (const k of claves) {
      const sobra = (k.startsWith(`${PREFIJO}mar:`) && k !== PREFIJO + claveMarVigente)
        || k === `${PREFIJO}temp-mar` || k === `${PREFIJO}clima-mar`;
      if (sobra) almacen.removeItem(k);
    }
  } catch {
    // almacenamiento bloqueado: no hay nada que podar
  }
}

// Devuelve { datos, t, desdeCache, vencido }: el guardado si está vigente; si no (o con forzar), lo pide y lo
// guarda. Sin conexión (la petición falla) se usa el último guardado aunque esté vencido, marcado `vencido`.
export async function conCache(almacen, clave, pedir, { forzar = false, maxMs = MAX_CACHE_MS, ahora = Date.now() } = {}) {
  if (!forzar) {
    const guardado = leerCache(almacen, clave, { maxMs, ahora });
    if (guardado) return { ...guardado, desdeCache: true, vencido: false };
  }
  try {
    const datos = await pedir();
    guardarCache(almacen, clave, datos, ahora);
    return { datos, t: ahora, desdeCache: false, vencido: false };
  } catch (e) {
    const viejo = leerCache(almacen, clave, { maxMs: Infinity, ahora });
    if (viejo) return { ...viejo, desdeCache: true, vencido: true };
    throw e;
  }
}
