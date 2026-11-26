// Publicidad propia (config.json → "promocion"). Para apagarla: "activa": false. Si falta algo o el enlace no es
// https, no se muestra nada.
export function leerPromocion(config) {
  const p = config?.promocion;
  if (!p?.activa || ![p.rotulo, p.titulo, p.boton].every(Boolean) || !p.url?.startsWith('https://')) return null;
  return p;
}

// Para contar, en la analítica del sitio de destino, las visitas que llegan desde la app y desde qué lugar.
export function enlaceDe(anuncio, lugar) {
  const u = new URL(anuncio.url);
  u.searchParams.set('utm_source', 'boletin-olas');
  u.searchParams.set('utm_medium', lugar);
  return u.href;
}

// La publicidad va arriba, donde salen las alertas: si hay alguna en pantalla, no se muestra.
export const promocionSinAlertas = (anuncio, alertas) => (alertas.some(Boolean) ? null : anuncio);
