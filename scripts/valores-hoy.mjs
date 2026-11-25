// Imprime ola/periodo/viento de cada playa para hoy: sirve para calibrar los umbrales de
// site/config.json comparándolos con lo que ves en la orilla. Uso: npm run valores
import fs from 'node:fs';
import { cargarMar, horasDelDia } from '../site/js/mar.js';

const catalogo = JSON.parse(fs.readFileSync(new URL('../site/playas.json', import.meta.url), 'utf8'));
// npm run valores -- [id...]  (sin ids, las 4 originales)
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['yuyos', 'la-punta', 'punta-hermosa', 'san-bartolo'];
const ahora = Date.now();
const fecha = new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10);

for (const playa of catalogo.playas.filter((p) => ids.includes(p.id))) {
  const horas = await cargarMar(playa);
  const dia = horasDelDia(horas, fecha, { horaInicio: 0, horaFin: 24 }, 0);
  console.log(`\n${playa.nombre} (${fecha})`);
  console.log('hora  ola(m)  periodo(s)  viento(km/h)  dir(°)');
  for (const h of dia.filter((x) => Number(x.hora.slice(11, 13)) % 3 === 0)) {
    console.log(`${h.hora.slice(11)}  ${String(h.hs).padEnd(6)}  ${String(h.tp).padEnd(10)}  ${String(h.vientoKmh).padEnd(12)}  ${h.dirViento}`);
  }
}
