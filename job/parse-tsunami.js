import { MESES, quitarTildes, fechaIso } from './tiempo.js';

export class BoletinNoEntendido extends Error {}

// "no genera tsunami en litoral peruano", con o sin "el".
const FRASE_SIN_RIESGO = /no genera tsunami en (?:el )?litoral peruano/;

// "BOLETÍN DE SISMO TSUNAMI N° 28-2026-2" (también Nº, No., Nro., NRO) -> { evento: '28-2026', version: 2 }
function leerNumero(titulo) {
  const m = titulo.match(/\bN(?:[°º]|ro\.?|o\.)\s*(\d+-\d{4})-(\d+)/i);
  if (!m) throw new BoletinNoEntendido(`Sin número de boletín en "${titulo}"`);
  return { numero: `${m[1]}-${m[2]}`, evento: m[1], version: Number(m[2]) };
}

// Un texto que no entendemos se considera alerta (mejor falso positivo que falso negativo):
// generaTsunamiEnPeru es true siempre que falte la frase explícita de "no genera tsunami".
export function parseTsunami({ titulo, texto }) {
  const { numero, evento, version } = leerNumero(titulo);
  const plano = quitarTildes(texto).toLowerCase().replace(/\s+/g, ' ');

  const f = plano.match(/el dia (\d{1,2}) (?:de )?([a-z]+) (?:de )?(\d{4}), a (\d{1,2}):(\d{2})(?::\d{2})? hora local/);
  const fechaLocal = f && MESES[f[2]]
    ? `${fechaIso(f[3], MESES[f[2]], f[1])}T${f[4].padStart(2, '0')}:${f[5]}:00-05:00`
    : null;

  const lugar = texto.match(/localizado (.+?)(?:, en tierra)?, con una magnitud/i);
  const magnitud = plano.match(/magnitud de ([\d.,]+) mw/);

  return {
    numero,
    evento,
    version,
    fechaLocal,
    lugar: lugar ? lugar[1].trim() : null,
    magnitud: magnitud ? Number(magnitud[1].replace(',', '.')) : null,
    generaTsunamiEnPeru: !FRASE_SIN_RIESGO.test(plano),
    textoCrudo: texto,
  };
}
