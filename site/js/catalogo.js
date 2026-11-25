// Búsqueda y cercanía sobre el catálogo de playas (site/playas.json). Todo se calcula en el navegador: la
// ubicación del remero no sale del celular.

export const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Cada palabra de la consulta debe aparecer en el nombre o la región. Conserva el orden del catálogo (norte a sur).
export function buscar(playas, consulta) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  return playas.filter((p) => {
    const texto = normalizar(`${p.nombre} ${p.region}`);
    return palabras.every((w) => texto.includes(w));
  });
}

// Distancia en línea recta (haversine), en km.
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cercanas(playas, posicion, n = 5) {
  return playas
    .map((playa) => ({ playa, km: distanciaKm(posicion, playa) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
