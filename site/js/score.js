import { LUGARES } from './lugares.js';

export const VERDE = 'verde';
export const AMARILLO = 'amarillo';
export const ROJO = 'rojo';
const ORDEN = { [VERDE]: 0, [AMARILLO]: 1, [ROJO]: 2 };

export const peor = (a, b) => (ORDEN[a] >= ORDEN[b] ? a : b);

const f1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

// ---------- Factores por hora ----------

export function colorAltura(hs, u) {
  if (hs <= u.altura.verde) return { color: VERDE, texto: `Olas de ${f1(hs)} m` };
  if (hs <= u.altura.amarillo) return { color: AMARILLO, texto: `Olas de ${f1(hs)} m, algo altas` };
  return { color: ROJO, texto: `Olas de ${f1(hs)} m, demasiado altas` };
}

// Escala descriptiva del mar por altura de ola. El rojo queda reservado para lo muy alto (más de
// `altura.agitado`), el tsunami o el oleaje Alto del DHN; el naranja es el tramo intermedio.
export const ETIQUETA_GRADO = {
  calmo: 'Mar calmo', algo: 'Mar con algo de olas', movido: 'Mar movido', agitado: 'Mar muy agitado',
};
export const COLOR_GRADO = { calmo: VERDE, algo: AMARILLO, movido: 'naranja', agitado: ROJO };
const ORDEN_GRADO = ['calmo', 'algo', 'movido', 'agitado'];

export function gradoMar(hs, u) {
  if (hs <= u.altura.verde) return 'calmo';
  if (hs <= u.altura.amarillo) return 'algo';
  if (hs <= u.altura.agitado) return 'movido';
  return 'agitado';
}

export function colorPeriodo(tp, hs, u) {
  const p = u.periodo;
  if (hs <= p.calmoHs) return { color: VERDE, texto: `Periodo de ${f1(tp)} s` };
  if (tp > p.amarillo && hs > p.rojoHs) {
    return { color: ROJO, texto: `Mar de fondo largo (${f1(tp)} s) con rompiente fuerte en orilla` };
  }
  if (tp > p.verde) return { color: AMARILLO, texto: `Periodo largo (${f1(tp)} s), rompiente en orilla` };
  return { color: VERDE, texto: `Periodo de ${f1(tp)} s` };
}

export function esTerral(dirViento, u) {
  return dirViento >= u.terral.dirDesde && dirViento <= u.terral.dirHasta;
}

export function colorViento(kmh, dirViento, u) {
  const general =
    kmh <= u.viento.verde ? VERDE : kmh <= u.viento.amarillo ? AMARILLO : ROJO;
  let color = general;
  let texto = `Viento de ${Math.round(kmh)} km/h`;
  if (esTerral(dirViento, u)) {
    const t = u.terral;
    const colorTerral = kmh <= t.verde ? VERDE : kmh <= t.amarillo ? AMARILLO : ROJO;
    if (ORDEN[colorTerral] > ORDEN[color]) color = colorTerral;
    if (colorTerral !== VERDE) texto = `Viento terral de ${Math.round(kmh)} km/h (empuja mar adentro)`;
  } else if (general !== VERDE) {
    texto = `Viento de ${Math.round(kmh)} km/h`;
  }
  return { color, texto };
}

const NIVEL_A_COLOR = { normal: VERDE, ligero: VERDE, moderado: AMARILLO, fuerte: ROJO, 'muy fuerte': ROJO };

export function colorDhn(nivel) {
  if (nivel === null || nivel === undefined) {
    return { color: AMARILLO, texto: 'Sin dato del DHN para esta hora' };
  }
  const color = NIVEL_A_COLOR[nivel] ?? AMARILLO;
  return { color, texto: `Oleaje ${nivel} según el DHN` };
}

// ---------- Aviso del DHN: tramo de la playa y nivel en un instante ----------

// Un tramo contiene la playa si queda entre su límite sur ("hasta", inclusivo) y su límite norte
// ("desde", exclusivo cuando dice "al sur de"). Gana el tramo más angosto. null si no hay.
export function tramoParaPlaya(playa, aviso) {
  if (!aviso) return null;
  const lat = playa.latTramo ?? playa.lat;
  let mejor = null;
  let anchoMejor = Infinity;
  for (const tramo of aviso.tramos) {
    const norte = LUGARES[tramo.desde];
    const sur = LUGARES[tramo.hasta];
    if (norte === undefined || sur === undefined) continue;
    const dentroNorte = tramo.desdeExclusivo ? lat < norte : lat <= norte;
    if (dentroNorte && lat >= sur && norte - sur < anchoMejor) {
      mejor = tramo;
      anchoMejor = norte - sur;
    }
  }
  return mejor;
}

// Nivel vigente en `instante` ('YYYY-MM-DDTHH:MM:SS-05:00', comparable como texto).
// null si el aviso ya venció.
export function nivelEn(tramo, aviso, instante) {
  if (instante > `${aviso.validoHasta}T23:59:59-05:00`) return null;
  let nivel = 'normal';
  for (const punto of tramo.linea) {
    if (punto.desde <= instante) nivel = punto.nivel;
  }
  return nivel;
}

// 'ok' | 'ausente' | 'obsoleto' | 'errorParseo'
export function estadoDhn(dhn, ahoraMs, u) {
  if (!dhn) return 'ausente';
  if (ahoraMs - Date.parse(dhn.generadoEn) > u.horasMaxDhn * 3600 * 1000) return 'obsoleto';
  if (dhn.parseError) return 'errorParseo';
  return 'ok';
}

// ---------- Evaluación de una hora ----------

const sinDato = (n) => n === null || n === undefined || Number.isNaN(n);

export function evaluarHora(dato, ctx) {
  const { umbrales: u, nivelDhn, estado, tsunamiAlerta } = ctx;
  const razones = [];
  if (tsunamiAlerta) {
    razones.push({ factor: 'tsunami', color: ROJO, texto: 'Alerta de sismo/tsunami del DHN' });
  }
  if (sinDato(dato.hs) || sinDato(dato.tp)) {
    razones.push({ factor: 'oleaje', color: AMARILLO, texto: 'Sin dato de oleaje para esta hora' });
  } else {
    razones.push({ factor: 'altura', ...colorAltura(dato.hs, u) });
    razones.push({ factor: 'periodo', ...colorPeriodo(dato.tp, dato.hs, u) });
  }
  if (sinDato(dato.vientoKmh) || sinDato(dato.dirViento)) {
    razones.push({ factor: 'viento', color: AMARILLO, texto: 'Sin dato de viento para esta hora' });
  } else {
    razones.push({ factor: 'viento', ...colorViento(dato.vientoKmh, dato.dirViento, u) });
  }
  let dhn = colorDhn(nivelDhn);
  if (estado !== 'ok' && dhn.color === VERDE) {
    dhn = { color: AMARILLO, texto: 'Sin aviso DHN reciente, revisa dhn.mil.pe' };
  }
  razones.push({ factor: 'dhn', ...dhn });
  const color = razones.reduce((c, r) => peor(c, r.color), VERDE);
  return { hora: dato.hora, color, razones, dato, nivelDhn };
}

// ---------- Evaluación de una playa en un día ----------

function rachas(horas, aceptable) {
  const salida = [];
  let inicio = null;
  horas.forEach((h, i) => {
    if (aceptable(h)) {
      if (inicio === null) inicio = i;
    } else if (inicio !== null) {
      salida.push([inicio, i - 1]);
      inicio = null;
    }
  });
  if (inicio !== null) salida.push([inicio, horas.length - 1]);
  return salida;
}

const horaDe = (iso) => Number(iso.slice(11, 13));

function mejorRacha(horas, aceptable, minHoras) {
  let mejor = null;
  for (const [a, b] of rachas(horas, aceptable)) {
    if (b - a + 1 < minHoras) continue;
    if (!mejor || b - a > mejor[1] - mejor[0]) mejor = [a, b];
  }
  return mejor;
}

// horasCrudas: [{hora:'2026-10-09T06:00', hs, tp, vientoKmh, dirViento}], ya filtradas a la ventana.
// Open-Meteo da la ola de su celda de mar abierto; en la zona tranquila donde se rema suele ser bastante
// menor. `playa.factorOla` (config.json, 1 si falta) la corrige; la ola original queda en `hsModelo`.
const corregirOla = (dato, factor) => (sinDato(dato.hs) || factor === 1
  ? dato
  : { ...dato, hsModelo: dato.hs, hs: Math.round(dato.hs * factor * 100) / 100 });

export function evaluarPlayaDia({ playa, horasCrudas: horasDelModelo, aviso, dhn, ahoraMs, config, tsunamiAlerta = false }) {
  const u = config.umbrales;
  const factorOla = playa.factorOla ?? 1;
  const horasCrudas = horasDelModelo.map((dato) => corregirOla(dato, factorOla));
  const estDhn = estadoDhn(dhn, ahoraMs, u);
  const tramo = aviso ? tramoParaPlaya(playa, aviso) : null;
  const notas = [];
  if (estDhn === 'ausente') notas.push('No hay datos del DHN: el semáforo no puede pasar de amarillo.');
  if (estDhn === 'obsoleto') notas.push('Los datos del DHN están desactualizados: tope amarillo.');
  if (estDhn === 'errorParseo') notas.push('No pude leer el último aviso del DHN: tope amarillo, revisa el texto original.');
  if (aviso && !tramo) notas.push('Esta playa no aparece en los tramos del aviso del DHN: tope amarillo.');
  if (aviso && tramo && horasCrudas.some((h) => `${h.hora}:00-05:00` > `${aviso.validoHasta}T23:59:59-05:00`)) {
    const [, mes, dia] = aviso.validoHasta.split('-');
    notas.push(`El último aviso del DHN venció el ${dia}/${mes}: tope amarillo hasta que haya uno nuevo.`);
  }

  const horas = horasCrudas.map((dato) => {
    let nivelDhn = null;
    if (aviso && tramo) nivelDhn = nivelEn(tramo, aviso, `${dato.hora}:00-05:00`);
    return evaluarHora(dato, { umbrales: u, nivelDhn, estado: aviso && tramo ? estDhn : 'ausente', tsunamiAlerta });
  });

  const min = u.bloqueMinHoras;
  const estado = horas.length === 0 ? 'sin-horas' : horas.length < min ? 'pocas-horas' : 'ok';
  const verde = mejorRacha(horas, (h) => h.color === VERDE, min);
  const apto = mejorRacha(horas, (h) => h.color !== ROJO, min);
  const rango = verde ?? apto;
  let bloque = null;
  let color = ROJO;
  if (rango) {
    color = verde ? VERDE : AMARILLO;
    bloque = {
      desde: horaDe(horas[rango[0]].hora),
      hasta: horaDe(horas[rango[1]].hora) + 1,
      color,
    };
  }

  let motivo;
  if (bloque) {
    const siguiente = horas[rango[1] + 1];
    motivo = `${color === VERDE ? 'Verde' : 'Amarillo'} ${bloque.desde}–${bloque.hasta} h`;
    if (siguiente && siguiente.color !== VERDE) {
      const r = siguiente.razones.filter((x) => x.color !== VERDE).sort((a, b) => ORDEN[b.color] - ORDEN[a.color])[0];
      motivo += `. Luego: ${r.texto.toLowerCase()}`;
    }
    if (color === AMARILLO) {
      const r = horas[rango[0]].razones.find((x) => x.color === AMARILLO);
      if (r) motivo += `. ${r.texto}`;
    }
  } else if (estado === 'sin-horas') {
    motivo = 'No quedan horas dentro de la ventana de este día';
  } else if (estado === 'pocas-horas') {
    motivo = `Queda menos de ${min} horas dentro de la ventana`;
  } else {
    const roja = horas.flatMap((h) => h.razones).find((x) => x.color === ROJO);
    motivo = roja ? `No apto: ${roja.texto.toLowerCase()}` : `No hay ${min} horas seguidas aptas`;
  }

  const alturas = horas.map((h) => h.dato.hs).filter((v) => !sinDato(v));
  const hsMedia = alturas.length ? alturas.reduce((a, b) => a + b, 0) / alturas.length : null;
  const dhnAlto = horas.some((h) => h.nivelDhn === 'fuerte' || h.nivelDhn === 'muy fuerte');
  let grado = hsMedia === null ? null : gradoMar(hsMedia, u);
  if (horas.length > 0 && (tsunamiAlerta || dhnAlto)) grado = 'agitado';
  let causa;
  if (tsunamiAlerta) causa = 'Alerta de sismo/tsunami del DHN';
  else if (dhnAlto) causa = 'Oleaje Alto según el DHN';
  else if (hsMedia !== null && hsMedia > u.altura.verde) {
    const delModelo = horas.map((h) => h.dato.hsModelo ?? h.dato.hs).filter((v) => !sinDato(v));
    const modeloMedia = delModelo.reduce((a, b) => a + b, 0) / delModelo.length;
    causa = factorOla === 1
      ? `Olas de ${f1(hsMedia)} m según el modelo; para mar calmo conviene menos de ${f1(u.altura.verde)} m`
      : `Olas de ${f1(hsMedia)} m en tu zona (modelo: ${f1(modeloMedia)} m); para mar calmo conviene menos de ${f1(u.altura.verde)} m`;
  } else causa = motivo;

  return { playa, horas, bloque, color, estado, motivo, notas, tramo: tramo?.nombre ?? null, hsMedia, grado, causa, factorOla };
}

// Playa para la que Open-Meteo no respondió: sin semáforo.
export function resultadoSinMar(playa) {
  return {
    playa, horas: [], bloque: null, color: ROJO, estado: 'sin-mar', hsMedia: null, grado: null, causa: null,
    motivo: 'No pude obtener el mar ahora', notas: [], tramo: null,
  };
}

// Qué titular mostrar: sin mar en ninguna playa, ya no quedan horas suficientes, la mejor playa,
// o "ninguna apta" (hay horas y el mar no da para remar).
export function estadoDia(resultados) {
  const conMar = resultados.filter((r) => r.estado !== 'sin-mar');
  if (conMar.length === 0) return { tipo: 'sin-mar' };
  const mejor = mejorPlaya(conMar);
  if (mejor) return { tipo: 'mejor', mejor };
  if (conMar.every((r) => r.estado === 'sin-horas' || r.estado === 'pocas-horas')) return { tipo: 'sin-horas' };
  // Sin bloque apto: se describe el mar de la playa que está en mejor grado, no se "juzga".
  const representante = conMar
    .filter((r) => r.grado)
    .sort((a, b) => ORDEN_GRADO.indexOf(a.grado) - ORDEN_GRADO.indexOf(b.grado) || (a.hsMedia ?? Infinity) - (b.hsMedia ?? Infinity))[0];
  return { tipo: 'ninguna', grado: representante?.grado ?? null, causa: representante?.causa ?? null };
}

// Alerta de oleaje del DHN (fuerte / muy fuerte) en alguna hora evaluada de alguna playa.
export function alertaOleaje(resultados) {
  const niveles = new Set(resultados.flatMap((r) => r.horas.map((h) => h.nivelDhn)));
  if (niveles.has('muy fuerte')) return { nivel: 'muy fuerte' };
  if (niveles.has('fuerte')) return { nivel: 'fuerte' };
  return null;
}

export function mejorPlaya(resultados) {
  const candidatas = resultados.filter((r) => r.bloque);
  candidatas.sort(
    (a, b) =>
      ORDEN[a.color] - ORDEN[b.color] ||
      b.bloque.hasta - b.bloque.desde - (a.bloque.hasta - a.bloque.desde) ||
      a.bloque.desde - b.bloque.desde,
  );
  return candidatas[0] ?? null;
}

// ---------- Tsunami ----------

// Por cada evento (28-2026) vale el boletín de mayor versión. Hay alerta si alguno de esos
// boletines, de las últimas 24 h, no declara "no genera tsunami en el litoral peruano".
export function evaluarTsunami(boletines, ahoraMs) {
  const ultimos = new Map();
  for (const b of boletines ?? []) {
    const clave = b.evento ?? b.numero;
    const previo = ultimos.get(clave);
    if (!previo || b.version > previo.version) ultimos.set(clave, b);
  }
  // Sin fechaLocal vale vistoEn (cuándo lo vio el job); sin ninguna de las dos, cuenta como reciente.
  const referencia = (b) => Date.parse(b.fechaLocal ?? b.vistoEn ?? '') || ahoraMs;
  const recientes = [...ultimos.values()].filter((b) => ahoraMs - referencia(b) <= 24 * 3600 * 1000);
  const alerta = recientes.find((b) => b.generaTsunamiEnPeru);
  if (alerta) return { estado: 'alerta', boletin: alerta };
  if (recientes.length) {
    recientes.sort((a, b) => referencia(b) - referencia(a));
    return { estado: 'informativo', boletin: recientes[0] };
  }
  return { estado: 'ninguno', boletin: null };
}

// ---------- Oleaje anómalo del DHN en lenguaje llano: Leve / Medio / Alto ----------

const ORDEN_NIVEL = ['normal', 'ligero', 'moderado', 'fuerte', 'muy fuerte'];
export const ETIQUETA_NIVEL = {
  normal: 'Normal', ligero: 'Leve', moderado: 'Medio', fuerte: 'Alto', 'muy fuerte': 'Alto (muy fuerte)',
};

function segmentosDelDia(tramo, aviso, fecha, ventana) {
  const segmentos = [];
  for (let h = ventana.horaInicio; h < ventana.horaFin; h++) {
    const nivel = nivelEn(tramo, aviso, `${fecha}T${String(h).padStart(2, '0')}:00:00-05:00`);
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.nivel === nivel) ultimo.hasta = h + 1;
    else segmentos.push({ desde: h, hasta: h + 1, nivel });
  }
  return segmentos;
}

// "Medio hasta las 12 h, luego Leve" / "Leve de 6 a 17 h" / "Sin aviso vigente del DHN".
export function textoSegmentos(segmentos) {
  const etiqueta = (n) => (n === null ? 'Sin aviso vigente del DHN' : ETIQUETA_NIVEL[n]);
  if (segmentos.length === 1) {
    const s = segmentos[0];
    return s.nivel === null ? etiqueta(null) : `${etiqueta(s.nivel)} de ${s.desde} a ${s.hasta} h`;
  }
  return segmentos
    .map((s, i) => (i === segmentos.length - 1 ? etiqueta(s.nivel) : `${etiqueta(s.nivel)} hasta las ${s.hasta} h`))
    .join(', luego ');
}

// Nivel del aviso del DHN a lo largo de la ventana de `fecha`, agrupando las playas que comparten
// tramo. null si no hay aviso. No usa datos del mar: es solo lo que dice el DHN.
export function resumenOleajeDia({ aviso, playas, fecha, ventana }) {
  if (!aviso) return null;
  const grupos = new Map();
  for (const playa of playas) {
    const tramo = tramoParaPlaya(playa, aviso);
    const clave = tramo?.nombre ?? null;
    if (!grupos.has(clave)) {
      const segmentos = tramo ? segmentosDelDia(tramo, aviso, fecha, ventana) : [];
      const niveles = segmentos.map((s) => s.nivel).filter((n) => n !== null);
      grupos.set(clave, {
        tramo: clave,
        playas: [],
        segmentos,
        nivelMax: niveles.length ? niveles.reduce((a, b) => (ORDEN_NIVEL.indexOf(b) > ORDEN_NIVEL.indexOf(a) ? b : a)) : null,
        texto: tramo ? textoSegmentos(segmentos) : 'Esta playa no aparece en los tramos del aviso',
      });
    }
    grupos.get(clave).playas.push(playa.nombre);
  }
  return { grupos: [...grupos.values()] };
}
