import { MESES, DIAS_SEMANA, quitarTildes, fechaIso, sumarDias, diaSemana, instanteLima } from './tiempo.js';

const HORA_PARTE = { madrugada: 0, manana: 6, tarde: 12, noche: 18 };

export class AvisoNoEntendido extends Error {}

const sinTildes = (s) => quitarTildes(s).toLowerCase();

// "NRO. 39-26", "NRO. 25 - 26", "Nro. 25-26", "N° 45-25", "Nº 25-26" -> { numero: '39-26', orden }.
// `orden` (año·1000 + número) sirve para elegir el aviso más nuevo; el job y el parser comparten esta lectura.
export function numeroDeTitulo(titulo) {
  const m = titulo.match(/\bn(?:ro|°|º)\.?\s*(\d+)\s*-\s*(\d+)/i);
  return m ? { numero: `${m[1]}-${m[2]}`, orden: Number(m[2]) * 1000 + Number(m[1]) } : null;
}

// "Válido del 08 al 12 de octubre del 2026", "del 09 a 13 de setiembre", "del 07 al 11 de agosto 2026",
// "del 29 al 06 de mayo 2026" (arranca el mes anterior), "del 30 de diciembre al 02 de enero 2027".
function leerValidez(titulo) {
  const t = sinTildes(titulo);
  const m = t.match(/valido del (\d{1,2})(?: de ([a-z]+))? al? (\d{1,2}) de ([a-z]+)(?: del?)? (\d{4})/);
  if (!m) throw new AvisoNoEntendido(`No entiendo la validez del título: "${titulo}"`);
  const [, d1, mes1, d2, mes2, anio] = m;
  const m2 = MESES[mes2];
  let m1 = mes1 ? MESES[mes1] : m2;
  if (!mes1 && m2 && Number(d1) > Number(d2)) m1 = m2 === 1 ? 12 : m2 - 1;
  if (!m1 || !m2) throw new AvisoNoEntendido(`Mes desconocido en "${titulo}"`);
  const anioHasta = Number(anio);
  const anioDesde = m1 > m2 ? anioHasta - 1 : anioHasta;
  return { validoDesde: fechaIso(anioDesde, m1, d1), validoHasta: fechaIso(anioHasta, m2, d2) };
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

// "Condiciones normales" también es un estado válido de un tramo (p. ej. "Al sur de Chancay hasta
// San Juan de Marcona: Condiciones normales") y la vuelta a la calma dentro de una línea de tiempo.
const RE_NIVEL = /\b(muy fuerte|ligero|moderado|fuerte|condiciones normales)\b/g;
// Momento de inicio: "desde la noche del sábado 06", "a partir de la tarde martes 14", "en la mañana del
// domingo 07", "en la noche del mismo día". "en" es muy común, así que solo vale si trae algo útil
// (parte del día, día de la semana, número de día o "mismo día"): ver momentoDeInicio.
const RE_INICIO =
  /(?:desde|a partir de|en) (?:la |el )?(madrugada|manana|tarde|noche)?(?: del?)?\s*(?:(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b\s*)?(?:(\d{1,2})|(mismo dia))?/g;

function momentoDeInicio(segmento) {
  // Con "en", la parte del día sola ("moderado en la noche") es ambigua: ¿de qué día? Solo vale con
  // una referencia de día; con "desde"/"a partir de" se mantiene el comportamiento histórico.
  const sirve = (m) => m[2] || m[3] || m[4] || (m[1] && !m[0].startsWith('en '));
  return [...segmento.matchAll(RE_INICIO)].find(sirve) ?? null;
}

// "jueves" sin número de día: el primer jueves desde la fecha de referencia (ella incluida).
function resolverSemana(semana, referencia) {
  for (let i = 0; i <= 7; i++) {
    const f = sumarDias(referencia, i);
    if (DIAS_SEMANA[diaSemana(f)] === semana) return f;
  }
  throw new AvisoNoEntendido(`No ubico el ${semana} desde ${referencia}`);
}

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
    const segmentoDe = (k) => t.slice(marcas[k].index + marcas[k][0].length, marcas[k + 1]?.index ?? t.length);
    const segmento = segmentoDe(i);
    let m = momentoDeInicio(segmento);
    // "incrementando a moderado, con intermitencia de fuerte, desde la tarde del viernes 08": la hora
    // llega después de la intermitencia y vale para los dos niveles.
    if (!m && i + 1 < marcas.length && /^\W*con intermiten/.test(segmento)) m = momentoDeInicio(segmentoDe(i + 1));
    let fecha;
    let hora = 0;
    let desde;
    if (!m) {
      const antes = t.slice(Math.max(0, marca.index - 40), marca.index);
      if (i === 0) {
        fecha = emision; // "Persistencia de oleaje ligero": ya presente al emitirse el aviso
      } else if (/intermiten/.test(antes)) {
        // "ligero con intermitencia de moderado": sin hora, se asume moderado todo el periodo
        // (lado seguro: nivelEn toma el último punto con la misma hora de inicio).
        fecha = null;
        desde = linea[linea.length - 1].desde;
      } else {
        throw new AvisoNoEntendido(`Nivel "${marca[0]}" sin momento de inicio: "${clausula}"`);
      }
    } else {
      if (m[1]) hora = HORA_PARTE[m[1]];
      if (m[3]) fecha = resolverDia(Number(m[3]), m[2] ?? null, emision);
      else if (m[2]) fecha = resolverSemana(m[2], fechaPrevia ?? emision);
      else fecha = fechaPrevia ?? emision; // "del mismo día" o solo "desde la tarde"
    }
    if (fecha !== null) fechaPrevia = fecha;
    desde ??= instanteLima(fecha, hora);
    if (linea.length && desde < linea[linea.length - 1].desde) {
      throw new AvisoNoEntendido(`Línea de tiempo desordenada: "${clausula}"`);
    }
    linea.push({ nivel: marca[0] === 'condiciones normales' ? 'normal' : marca[0], desde });
  });
  return linea;
}

function leerLimites(etiqueta) {
  const t = sinTildes(etiqueta)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^litoral \w+ \(?zona /, '')
    .replace(/^\(?zona /, '')
    .replace(/^.*?(?=al sur de )/, ''); // "Arribo Al sur de Salaverry…" (errata del DHN en 36-26)
  const m = t.match(/^(al sur de |de )?([a-z ]+?) hasta ([a-z ]+?)\)?$/);
  if (!m) throw new AvisoNoEntendido(`No entiendo el tramo: "${etiqueta}"`);
  return { desde: m[2].trim(), hasta: m[3].trim(), desdeExclusivo: m[1] === 'al sur de ' };
}

// "Estos oleajes estarán presentes en nuestro litoral hasta el viernes 26 de junio" -> '2026-06-26'.
function leerHorizonte(texto, emision, validoTitulo) {
  const m = sinTildes(texto).match(/presentes en nuestro litoral hasta (?:el )?(?:[a-z]+ )?(\d{1,2}) de ([a-z]+)(?: del? (\d{4}))?/);
  if (!m || !MESES[m[2]]) return null;
  const anio = m[3] ? Number(m[3]) : Number(validoTitulo.slice(0, 4));
  let fecha = fechaIso(anio, MESES[m[2]], m[1]);
  if (!m[3] && fecha < emision) fecha = fechaIso(anio + 1, MESES[m[2]], m[1]); // cruce de año
  return fecha;
}

// La nota final ("Nota: Clasificación del estado de mar…") define los niveles con frases como "hasta el
// doble de sus condiciones normales": no es pronóstico y no debe leerse como tramo.
function sinNota(texto) {
  const i = sinTildes(texto).search(/nota\s*:?\s*clasificacion/);
  return i === -1 ? texto : texto.slice(0, i);
}

// Viñeta: "a)" o cualquier símbolo (el portal entrega "?" por un problema de codificación; si lo
// corrigen puede aparecer "▪", "•" o un glifo privado de Wingdings).
const RE_TRAMO = /^\s*(?:(?:[a-z][).]|o(?=\s)|[^\p{L}\p{N}\s])\s*|(?=(?:al sur de|litoral)\b))(.+?):\s*(.*)$/iu;
const PARECE_TRAMO = /(al sur de|zona de|litoral)\b.*\bhasta\b/;
const MENCIONA_NIVEL = /\b(ligero|moderado|fuerte)\b/;

export function parseAviso({ titulo, texto, id = null }) {
  const numero = numeroDeTitulo(titulo)?.numero;
  if (!numero) throw new AvisoNoEntendido(`Sin número de aviso en "${titulo}"`);
  const { validoDesde, validoHasta: validoTitulo } = leerValidez(titulo);
  const emitidoEn = leerEmision(texto, validoDesde);

  const tramos = [];
  for (const linea of sinNota(texto).split('\n')) {
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

  // El título a veces queda corto (24-26: "del 21 al 23" pero pronostica hasta el 24 y dice "presentes hasta
  // el viernes 26"): el aviso rige hasta el último de esos tres momentos.
  const ultimoPunto = tramos.flatMap((t) => t.linea).map((p) => p.desde.slice(0, 10)).sort().pop();
  const validoHasta = [validoTitulo, leerHorizonte(texto, emitidoEn, validoTitulo), ultimoPunto]
    .filter(Boolean)
    .sort()
    .pop();

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
