import { MESES, DIAS_SEMANA, quitarTildes, fechaIso, sumarDias, diaSemana, instanteLima } from './tiempo.js';

const HORA_PARTE = { madrugada: 0, manana: 6, tarde: 12, noche: 18 };

export class AvisoNoEntendido extends Error {}

const sinTildes = (s) => quitarTildes(s).toLowerCase();

function leerValidez(titulo) {
  const t = sinTildes(titulo);
  const m = t.match(/valido del (\d{1,2})(?: de ([a-z]+))? al (\d{1,2}) de ([a-z]+) del? (\d{4})/);
  if (!m) throw new AvisoNoEntendido(`No entiendo la validez del título: "${titulo}"`);
  const [, d1, mes1, d2, mes2, anio] = m;
  const m2 = MESES[mes2];
  const m1 = mes1 ? MESES[mes1] : m2;
  if (!m1 || !m2) throw new AvisoNoEntendido(`Mes desconocido en "${titulo}"`);
  return { validoDesde: fechaIso(anio, m1, d1), validoHasta: fechaIso(anio, m2, d2) };
}

function leerEmision(texto, validoDesde) {
  const m = sinTildes(texto).match(/callao,\s*(\d{1,2}) de ([a-z]+)\s*(?:del? )?(\d{4})/);
  if (!m || !MESES[m[2]]) return validoDesde;
  return fechaIso(m[3], MESES[m[2]], m[1]);
}

// Busca la fecha civil cuyo día (y día de semana, si viene) coincide, cerca de la emisión.
function resolverDia(dia, semana, emision) {
  for (let i = -2; i <= 14; i++) {
    const f = sumarDias(emision, i);
    if (Number(f.slice(8)) !== dia) continue;
    if (semana !== null && DIAS_SEMANA[diaSemana(f)] !== semana) continue;
    return f;
  }
  throw new AvisoNoEntendido(`No ubico el día ${dia} cerca de ${emision}`);
}

const RE_NIVEL = /\b(muy fuerte|ligero|moderado|fuerte)\b/g;
const RE_INICIO =
  /desde (?:la |el )?(madrugada|manana|tarde|noche)?(?: del?)?\s*(?:(lunes|martes|miercoles|jueves|viernes|sabado|domingo) )?(?:(\d{1,2})|(mismo dia))?/;

// "Persistencia de oleaje ligero ... incrementando a moderado desde la noche del mismo día y
// decreciendo a ligero desde la tarde del viernes 09 de octubre" -> línea de tiempo de niveles.
// Devuelve null si la cláusula no menciona niveles de oleaje.
export function parsearLinea(clausula, emision) {
  const t = sinTildes(clausula);
  const marcas = [...t.matchAll(RE_NIVEL)];
  if (marcas.length === 0) return null;
  const linea = [];
  let fechaPrevia = null;
  marcas.forEach((marca, i) => {
    const segmento = t.slice(marca.index + marca[0].length, marcas[i + 1]?.index ?? t.length);
    const m = segmento.match(RE_INICIO);
    let fecha;
    let hora = 0;
    if (!m) {
      if (i > 0) throw new AvisoNoEntendido(`Nivel "${marca[0]}" sin momento de inicio: "${clausula}"`);
      fecha = emision; // "Persistencia de oleaje ligero": ya presente al emitirse el aviso
    } else {
      if (m[1]) hora = HORA_PARTE[m[1]];
      if (m[3]) fecha = resolverDia(Number(m[3]), m[2] ?? null, emision);
      else fecha = fechaPrevia ?? emision; // "del mismo día" o solo "desde la tarde"
    }
    fechaPrevia = fecha;
    const desde = instanteLima(fecha, hora);
    if (linea.length && desde < linea[linea.length - 1].desde) {
      throw new AvisoNoEntendido(`Línea de tiempo desordenada: "${clausula}"`);
    }
    linea.push({ nivel: marca[0], desde });
  });
  return linea;
}

function leerLimites(etiqueta) {
  const t = sinTildes(etiqueta)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^litoral \w+ \(?zona /, '')
    .replace(/^\(?zona /, '');
  const m = t.match(/^(al sur de |de )?([a-z ]+?) hasta ([a-z ]+?)\)?$/);
  if (!m) throw new AvisoNoEntendido(`No entiendo el tramo: "${etiqueta}"`);
  return { desde: m[2].trim(), hasta: m[3].trim(), desdeExclusivo: m[1] === 'al sur de ' };
}

// Viñeta: "a)" o cualquier símbolo (el portal entrega "?" por un problema de codificación; si lo
// corrigen puede aparecer "▪", "•" o un glifo privado de Wingdings).
const RE_TRAMO = /^\s*(?:[a-z]\)|[^\p{L}\p{N}\s])\s*(.+?):\s*(.*)$/iu;
const PARECE_TRAMO = /(al sur de|zona de|litoral)\b.*\bhasta\b/;
const MENCIONA_NIVEL = /\b(ligero|moderado|fuerte)\b/;

export function parseAviso({ titulo, texto, id = null }) {
  const numero = (titulo.match(/NRO\.\s*(\d+-\d+)/i) || [])[1];
  if (!numero) throw new AvisoNoEntendido(`Sin número de aviso en "${titulo}"`);
  const { validoDesde, validoHasta } = leerValidez(titulo);
  const emitidoEn = leerEmision(texto, validoDesde);

  const tramos = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(RE_TRAMO);
    if (!m) {
      const t = sinTildes(linea);
      if (PARECE_TRAMO.test(t) && MENCIONA_NIVEL.test(t)) {
        // Un tramo con niveles que no sabemos leer jamás se descarta en silencio: la playa podría
        // quedar con el nivel de un tramo más ancho (verde sin respaldo).
        throw new AvisoNoEntendido(`Línea de tramo no reconocida: "${linea.trim()}"`);
      }
      continue;
    }
    const niveles = parsearLinea(m[2], emitidoEn);
    if (!niveles) continue; // encabezado sin niveles (p. ej. "Litoral Centro (...):")
    const limites = leerLimites(m[1]);
    tramos.push({ nombre: m[1].trim(), ...limites, linea: niveles });
  }
  if (tramos.length === 0) throw new AvisoNoEntendido('No encontré ningún tramo con niveles de oleaje');

  const luna = texto.match(/fase lunar de ([^,.]+?)(?: orbitando|[,.])/i);
  return {
    numero,
    emitidoEn,
    validoDesde,
    validoHasta,
    url: id
      ? `https://www.dhn.mil.pe/portal/avisos-especiales/${id}`
      : 'https://www.dhn.mil.pe/portal/avisos-especiales',
    tramos,
    faseLunar: luna ? luna[1].trim() : null,
    textoCrudo: texto,
  };
}
