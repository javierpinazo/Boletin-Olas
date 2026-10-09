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
  return { hora: dato.hora, color, razones, dato };
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
export function evaluarPlayaDia({ playa, horasCrudas, aviso, dhn, ahoraMs, config, tsunamiAlerta = false }) {
  const u = config.umbrales;
  const estado = estadoDhn(dhn, ahoraMs, u);
  const tramo = aviso ? tramoParaPlaya(playa, aviso) : null;
  const notas = [];
  if (estado === 'ausente') notas.push('No hay datos del DHN: el semáforo no puede pasar de amarillo.');
  if (estado === 'obsoleto') notas.push('Los datos del DHN están desactualizados: tope amarillo.');
  if (estado === 'errorParseo') notas.push('No pude leer el último aviso del DHN: tope amarillo, revisa el texto original.');
  if (aviso && !tramo) notas.push('Esta playa no aparece en los tramos del aviso del DHN: tope amarillo.');

  const horas = horasCrudas.map((dato) => {
    let nivelDhn = null;
    if (aviso && tramo) nivelDhn = nivelEn(tramo, aviso, `${dato.hora}:00-05:00`);
    return evaluarHora(dato, { umbrales: u, nivelDhn, estado: aviso && tramo ? estado : 'ausente', tsunamiAlerta });
  });

  const min = u.bloqueMinHoras;
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
  } else if (horas.length === 0) {
    motivo = 'Sin datos para este día';
  } else {
    const menosMala = [...horas].sort((a, b) => ORDEN[a.color] - ORDEN[b.color])[0];
    const r = menosMala.razones.filter((x) => x.color === ROJO)[0] ?? menosMala.razones[0];
    motivo = `No apto: ${r.texto.toLowerCase()}`;
  }

  return { playa, horas, bloque, color, motivo, notas, tramo: tramo?.nombre ?? null };
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
