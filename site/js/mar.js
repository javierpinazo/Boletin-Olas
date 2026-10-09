// Datos de oleaje y viento por playa desde Open-Meteo (gratuito, sin clave, admite CORS).

const MARINO = 'https://marine-api.open-meteo.com/v1/marine';
const VIENTO = 'https://api.open-meteo.com/v1/forecast';
const COMUN = 'forecast_days=3&timezone=America%2FLima';

export const urlMar = (p) =>
  `${MARINO}?latitude=${p.lat}&longitude=${p.lon}&hourly=wave_height,wave_period&${COMUN}`;
export const urlViento = (p) =>
  `${VIENTO}?latitude=${p.lat}&longitude=${p.lon}&hourly=wind_speed_10m,wind_direction_10m&${COMUN}`;

// Une las dos respuestas por hora ('2026-10-09T07:00', hora de Lima). Devuelve
// [{hora, hs, tp, vientoKmh, dirViento}], con null donde la fuente no trae dato.
export function combinarHoras(mar, viento) {
  const porHora = new Map();
  const tomar = (json, campos) => {
    const h = json?.hourly;
    if (!h || !Array.isArray(h.time)) throw new Error('Respuesta de Open-Meteo sin datos horarios');
    h.time.forEach((hora, i) => {
      const fila = porHora.get(hora) ?? { hora, hs: null, tp: null, vientoKmh: null, dirViento: null };
      for (const [origen, destino] of Object.entries(campos)) fila[destino] = h[origen]?.[i] ?? null;
      porHora.set(hora, fila);
    });
  };
  tomar(mar, { wave_height: 'hs', wave_period: 'tp' });
  tomar(viento, { wind_speed_10m: 'vientoKmh', wind_direction_10m: 'dirViento' });
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

export async function cargarMar(playa, fetchFn = fetch) {
  const [mar, viento] = await Promise.all(
    [urlMar(playa), urlViento(playa)].map(async (url) => {
      const r = await fetchFn(url);
      if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
      return r.json();
    }),
  );
  return combinarHoras(mar, viento);
}
