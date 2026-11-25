// Respaldo de la temperatura del mar: Open-Meteo Marine (promedio diario). Tiene el dato de hoy, pero casi
// no tiene historial, así que solo se usa cuando NOAA OISST falla; el "habitual" sigue saliendo de OISST.
const MARINO = 'https://marine-api.open-meteo.com/v1/marine';

export async function pedirOpenMeteo({ lat, lon, ahora = new Date(), dias = 45, fetchFn = fetch, senal }) {
  const url = `${MARINO}?latitude=${lat}&longitude=${lon}&hourly=sea_surface_temperature&past_days=${dias}&forecast_days=1&timezone=America%2FLima`;
  const propia = AbortSignal.timeout(30_000);
  const r = await fetchFn(url, { signal: senal ? AbortSignal.any([propia, senal]) : propia });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const { hourly } = await r.json();
  const limite = ahora.getTime();
  const porDia = new Map();
  (hourly?.time ?? []).forEach((t, i) => {
    const v = hourly.sea_surface_temperature?.[i];
    if (typeof v !== 'number' || Date.parse(`${t}:00-05:00`) > limite) return; // sin nulos ni horas futuras
    const a = porDia.get(t.slice(0, 10)) ?? { suma: 0, n: 0 };
    a.suma += v; a.n += 1;
    porDia.set(t.slice(0, 10), a);
  });
  const filas = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, a]) => ({ fecha, sst: a.suma / a.n }));
  if (!filas.length) throw new Error(`Open-Meteo sin temperatura del mar para ${lat},${lon}`);
  return filas;
}
