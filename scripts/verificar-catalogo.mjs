// Comprueba que el modelo marino de Open-Meteo tenga datos para cada playa del catálogo (usa la red, no entra en
// npm test). Uso: node scripts/verificar-catalogo.mjs
import fs from 'node:fs';
import { cargarMarVarias, ahoraLima } from '../site/js/mar.js';

const { playas } = JSON.parse(fs.readFileSync(new URL('../site/playas.json', import.meta.url), 'utf8'));
const hora = `${ahoraLima(Date.now()).slice(0, 10)}T12:00`;
const horas = await cargarMarVarias(playas, fetch, 60_000);
const sinDato = [];
playas.forEach((p, i) => {
  const h = horas[i].find((x) => x.hora === hora);
  if (typeof h?.hs !== 'number') sinDato.push(p.id);
  console.log(`${p.id.padEnd(24)} ola 12 h: ${h?.hs ?? 'SIN DATO'}`);
});
console.log(sinDato.length ? `\nSin dato de ola: ${sinDato.join(', ')}` : `\nLas ${playas.length} playas tienen dato de ola.`);
process.exit(sinDato.length ? 1 : 0);
