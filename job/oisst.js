// Temperatura del mar de NOAA OISST (celdas de 0,25°, un dato por día) vía ERDDAP. Sirve igual para el
// histórico (clima habitual) y para el dato casi actual, así que las dos cifras son comparables.
const BASE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap';

// Centro de la celda de 0,25° que contiene la coordenada (los centros caen en .125, .375, .625, .875).
export const centroCelda = (x) => Math.floor(x * 4) / 4 + 0.125;

// Pide la serie de una celda; si es tierra (NaN) prueba con las celdas más al oeste (mar adentro).
// ERDDAP responde 503 cuando está saturado: se reintenta con espera creciente.
// Espera que se corta si se acaba el plazo.
const dormir = (ms, senal) => new Promise((res) => {
  if (senal?.aborted) { res(); return; }
  const fin = () => { clearTimeout(t); senal?.removeEventListener('abort', fin); res(); };
  const t = setTimeout(fin, ms);
  senal?.addEventListener('abort', fin);
});

async function pedirTexto(url, fetchFn, espera, senal) {
  let ultimo;
  for (let intento = 0; intento < 4; intento += 1) {
    if (senal?.aborted) throw new Error('OISST: se acabó el plazo');
    try {
      const propia = AbortSignal.timeout(280_000);
      const r = await fetchFn(url, { signal: senal ? AbortSignal.any([propia, senal]) : propia });
      if (r.ok) return await r.text();
      ultimo = new Error(`OISST ${r.status}`); // 404 también se reintenta: ERDDAP lo da mientras recarga el dato
    } catch (e) {
      ultimo = e;
    }
    await dormir(espera * (intento + 1), senal);
  }
  if (senal?.aborted) throw new Error('OISST: se acabó el plazo');
  if (ultimo?.message === `OISST 404`) return '';
  throw ultimo;
}

export async function pedirCelda({ lat, lon, desde, hasta, reciente = false, fetchFn = fetch, espera = 5000, senal }) {
  const dataset = reciente ? 'ncdcOisst21NrtAgg_LonPM180' : 'ncdcOisst21Agg_LonPM180';
  const la = centroCelda(lat);
  for (let paso = 0; paso < 3; paso += 1) {
    const lo = centroCelda(lon) - 0.25 * paso;
    const tiempo = reciente ? `(${desde}):1:(last)` : `(${desde}):1:(${hasta})`;
    const url = `${BASE}/${dataset}.csv?sst%5B${tiempo}%5D%5B(0.0):1:(0.0)%5D%5B(${la}):1:(${la})%5D%5B(${lo}):1:(${lo})%5D`;
    const texto = await pedirTexto(url, fetchFn, espera, senal);
    const filas = texto.trim().split('\n').slice(2)
      .map((l) => l.split(','))
      .map((c) => ({ fecha: c[0].slice(0, 10), sst: Number(c[4]) }))
      .filter((f) => Number.isFinite(f.sst));
    if (filas.length) return { celda: { lat: la, lon: lo }, filas };
  }
  throw new Error(`OISST sin datos de mar para ${lat},${lon}`);
}
