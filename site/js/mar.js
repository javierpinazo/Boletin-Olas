// Datos de oleaje, viento y nivel del mar por playa desde Open-Meteo (gratuito, sin clave, admite CORS).

const MARINO = 'https://marine-api.open-meteo.com/v1/marine';
const VIENTO = 'https://api.open-meteo.com/v1/forecast';
const COMUN = 'forecast_days=3&timezone=America%2FLima';

const CAMPOS_MAR = {
  wave_height: 'hs', wave_period: 'tp', wave_direction: 'dirOla', sea_level_height_msl: 'nivelMar',
};
const CAMPOS_VIENTO = {
  wind_speed_10m: 'vientoKmh', wind_direction_10m: 'dirViento', wind_gusts_10m: 'rafagaKmh',
  temperature_2m: 'tempAire', cloud_cover: 'nubes', sunshine_duration: 'solSeg', // clima: no entra en el semáforo
};

export const urlMar = (p) =>
  `${MARINO}?latitude=${p.lat}&longitude=${p.lon}&hourly=${Object.keys(CAMPOS_MAR).join(',')}&${COMUN}`;
export const urlViento = (p) =>
  `${VIENTO}?latitude=${p.lat}&longitude=${p.lon}&hourly=${Object.keys(CAMPOS_VIENTO).join(',')}&${COMUN}`;

// Une las dos respuestas por hora ('2026-10-09T07:00', hora de Lima). Devuelve
// [{hora, hs, tp, dirOla, nivelMar, vientoKmh, dirViento, rafagaKmh, tempAire, nubes, solSeg}], con null donde no hay dato.
export function combinarHoras(mar, viento) {
  const porHora = new Map();
  const vacia = (hora) => ({ hora, ...Object.fromEntries([...Object.values(CAMPOS_MAR), ...Object.values(CAMPOS_VIENTO)].map((c) => [c, null])) });
  const tomar = (json, campos) => {
    const h = json?.hourly;
    if (!h || !Array.isArray(h.time)) throw new Error('Respuesta de Open-Meteo sin datos horarios');
    h.time.forEach((hora, i) => {
      const fila = porHora.get(hora) ?? vacia(hora);
      for (const [origen, destino] of Object.entries(campos)) fila[destino] = h[origen]?.[i] ?? null;
      porHora.set(hora, fila);
    });
  };
  tomar(mar, CAMPOS_MAR);
  tomar(viento, CAMPOS_VIENTO);
  return [...porHora.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

// 'YYYY-MM-DDTHH:MM' en hora de Lima (UTC-5, sin horario de verano).
export const ahoraLima = (ms) => new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 16);

// Horas de `fecha` ('YYYY-MM-DD') dentro de la ventana [horaInicio, horaFin). Para el día en curso,
// descarta las horas que ya pasaron.
export function horasDelDia(horas, fecha, ventana, ahoraMs) {
  const ahora = ahoraLima(ahoraMs);
  return horas.filter((h) => {
    if (!h.hora.startsWith(fecha)) return false;
    const n = Number(h.hora.slice(11, 13));
    if (n < ventana.horaInicio || n >= ventana.horaFin) return false;
    return h.hora.slice(0, 13) >= ahora.slice(0, 13);
  });
}

// Pleamares y bajamares de `fecha` a partir del nivel del mar horario (máximos y mínimos locales).
// Usa las horas vecinas de los días contiguos para no perder un extremo a las 0 o a las 23 h.
export function mareasDelDia(horas, fecha) {
  const serie = horas.filter((h) => h.nivelMar !== null && h.nivelMar !== undefined);
  const mareas = [];
  for (let i = 1; i < serie.length - 1; i++) {
    const { hora, nivelMar: n } = serie[i];
    if (!hora.startsWith(fecha)) continue;
    const antes = serie[i - 1].nivelMar;
    const despues = serie[i + 1].nivelMar;
    if (n > antes && n >= despues) mareas.push({ tipo: 'pleamar', hora: Number(hora.slice(11, 13)), nivel: n });
    else if (n < antes && n <= despues) mareas.push({ tipo: 'bajamar', hora: Number(hora.slice(11, 13)), nivel: n });
  }
  return mareas;
}

// Cada consulta tiene un plazo: si Open-Meteo se cuelga, la página no se queda "consultando" para siempre.
export async function cargarMar(playa, fetchFn = fetch, timeoutMs = 15000) {
  const pedir = async (url) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let r;
    try {
      r = await fetchFn(url, { signal });
    } catch (e) {
      if (signal.aborted) throw new Error(`Open-Meteo no respondió a tiempo (${timeoutMs / 1000} s)`);
      throw e;
    }
    if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
    return r.json();
  };
  const [mar, viento] = await Promise.all([pedir(urlMar(playa)), pedir(urlViento(playa))]);
  return combinarHoras(mar, viento);
}
