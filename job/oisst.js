// Temperatura del mar de NOAA OISST (celdas de 0,25°, un dato por día) vía ERDDAP. Sirve igual para el
// histórico (clima habitual) y para el dato casi actual, así que las dos cifras son comparables.
const BASE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap';

// Centro de la celda de 0,25° que contiene la coordenada (los centros caen en .125, .375, .625, .875).
export const centroCelda = (x) => Math.floor(x * 4) / 4 + 0.125;

// Pide la serie de una celda; si es tierra (NaN) prueba con las celdas más al oeste (mar adentro).
// ERDDAP responde 503 cuando está saturado: se reintenta con espera creciente.
async function pedirTexto(url, fetchFn) {
  let ultimo;
  for (let intento = 0; intento < 4; intento += 1) {
    try {
      const r = await fetchFn(url, { signal: AbortSignal.timeout(280_000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
      ultimo = new Error(`OISST ${r.status}`);
    } catch (e) {
      ultimo = e;
    }
    await new Promise((res) => setTimeout(res, 5000 * (intento + 1)));
  }
  throw ultimo;
}

export async function pedirCelda({ lat, lon, desde, hasta, reciente = false, fetchFn = fetch }) {
  const dataset = reciente ? 'ncdcOisst21NrtAgg_LonPM180' : 'ncdcOisst21Agg_LonPM180';
  const la = centroCelda(lat);
  for (let paso = 0; paso < 3; paso += 1) {
    const lo = centroCelda(lon) - 0.25 * paso;
    const tiempo = reciente ? `(last-${hasta}):1:(last)` : `(${desde}):1:(${hasta})`;
    const url = `${BASE}/${dataset}.csv?sst%5B${tiempo}%5D%5B(0.0):1:(0.0)%5D%5B(${la}):1:(${la})%5D%5B(${lo}):1:(${lo})%5D`;
    const texto = await pedirTexto(url, fetchFn);
    const filas = texto.trim().split('\n').slice(2)
      .map((l) => l.split(','))
      .map((c) => ({ fecha: c[0].slice(0, 10), sst: Number(c[4]) }))
      .filter((f) => Number.isFinite(f.sst));
    if (filas.length) return { celda: { lat: la, lon: lo }, filas };
  }
  throw new Error(`OISST sin datos de mar para ${lat},${lon}`);
}
