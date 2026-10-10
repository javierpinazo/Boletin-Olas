import { cargarMar, horasDelDia, ahoraLima, mareasDelDia } from './mar.js';
import {
  evaluarPlayaDia, evaluarTsunami, estadoDhn, estadoDia, resultadoSinMar, alertaOleaje, resumenOleajeDia, ETIQUETA_NIVEL,
  describirSinBloque, motivoHora,
} from './score.js';
import {
  IMPRESIONES, nuevaSalida, agregarSalida, factorAprendido, fusionar, hsBaseDelDia, leerSalidas, guardarSalidas,
} from './salidas.js';

const SIMBOLO = { verde: '✔', amarillo: '⚠', naranja: '▲', rojo: '✖' };
const ETIQUETA = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };
const ETIQUETA_ESTADO = { 'sin-horas': 'Sin horas', 'pocas-horas': 'Menos de 2 h' };
const ZONA = 'America/Lima';

// Todo el texto remoto (DHN, Open-Meteo) entra con textContent: nunca como HTML.
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') nodo.className = v;
    else if (k === 'text') nodo.textContent = v;
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h) nodo.append(h);
  return nodo;
}

const num1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const coma = (n) => String(n).replace('.', ',');
const fmt = (ms, opts) => new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, ...opts }).format(ms);
const fechaCorta = (ms) => fmt(ms, { weekday: 'short', day: 'numeric', month: 'short' });
const horaCorta = (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

// localStorage puede no existir o lanzar al tocarlo (modo privado, sitio bloqueado).
function almacen() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

async function cargarJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const estado = {
  dia: 0, config: null, dhn: null, mar: [], ahoraMs: 0, marMs: 0, diaCargado: null,
  salidas: [], abiertas: new Set(), mensajeSalidas: '',
};

async function iniciar() {
  const raiz = document.getElementById('app');
  raiz.replaceChildren(el('p', { class: 'cargando', text: 'Consultando el mar y el aviso del DHN…' }));
  estado.config = await cargarJson('./config.json');
  estado.dhn = await cargarJson('./data/dhn.json').catch(() => null);
  const resultados = await Promise.allSettled(estado.config.playas.map((p) => cargarMar(p)));
  estado.mar = resultados.map((r) => (r.status === 'fulfilled' ? r.value : null));
  estado.salidas = leerSalidas(almacen());
  estado.ahoraMs = Date.now();
  estado.marMs = estado.ahoraMs;
  estado.diaCargado = ahoraLima(estado.ahoraMs).slice(0, 10);
  pintar();
}

function fechaDelDia(offset) {
  const base = ahoraLima(estado.ahoraMs).slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function evaluarTodo() {
  const { config, dhn, ahoraMs } = estado;
  const tsun = evaluarTsunami(dhn?.tsunami, ahoraMs);
  const fecha = fechaDelDia(estado.dia);
  const resultados = config.playas.map((playa, i) => {
    // Con 3 o más salidas registradas en esta playa, su factor de ola aprendido reemplaza al del config.
    const aprendido = factorAprendido(estado.salidas, playa.id);
    const horas = estado.mar[i];
    const base = horas
      ? evaluarPlayaDia({
        playa: aprendido ? { ...playa, factorOla: aprendido.factor } : playa,
        horasCrudas: horasDelDia(horas, fecha, config.ventana, ahoraMs),
        aviso: dhn?.aviso ?? null,
        dhn,
        ahoraMs,
        config,
        tsunamiAlerta: tsun.estado === 'alerta',
      })
      : resultadoSinMar(playa);
    return { ...base, playa, indice: i, aprendido, mareas: horas ? mareasDelDia(horas, fecha) : [] };
  });
  const oleaje = resumenOleajeDia({
    aviso: dhn?.aviso ?? null, playas: config.playas, fecha, ventana: config.ventana,
  });
  return { tsun, resultados, oleaje };
}

// Leve / Medio / Alto del DHN con el color del semáforo (ligero verde, moderado amarillo, fuerte rojo).
const COLOR_NIVEL = { normal: 'verde', ligero: 'verde', moderado: 'amarillo', fuerte: 'rojo', 'muy fuerte': 'rojo' };
const colorNivel = (nivel) => COLOR_NIVEL[nivel] ?? 'gris';

function bloqueOleaje(oleaje) {
  const titulo = el('h2', { text: 'Oleaje anómalo (DHN)' });
  if (!oleaje) {
    return el('section', { class: 'oleaje' }, titulo, el('p', { class: 'gris', text: 'No hay aviso del DHN para este día.' }));
  }
  const unico = oleaje.grupos.every((g) => g.texto === oleaje.grupos[0].texto);
  const grupos = unico ? [{ ...oleaje.grupos[0], playas: null }] : oleaje.grupos;
  return el('section', { class: 'oleaje' }, titulo, grupos.map((g) => {
    const color = colorNivel(g.nivelMax);
    return el('p', {},
      g.playas ? el('span', { class: 'gris', text: `${g.playas.join(', ')}: ` }) : null,
      el('span', { class: `chip ${color}`, text: `${g.nivelMax ? SIMBOLO[color] + ' ' : ''}${g.texto}` }));
  }));
}

function pintar() {
  const { tsun, resultados, oleaje } = evaluarTodo();
  const raiz = document.getElementById('app');
  const piezas = [
    bannerTsunami(tsun),
    bannerDhn(),
    bannerOleaje(resultados),
    pestanas(),
    bloqueOleaje(oleaje),
    mejorOpcion(resultados),
    ...resultados.map((r) => tarjeta(r, oleaje)),
    panelSalidas(),
    pie(tsun),
  ];
  raiz.replaceChildren(...piezas.filter(Boolean));
}

function bannerTsunami(tsun) {
  if (tsun.estado !== 'alerta') return null;
  const b = tsun.boletin;
  return el('section', { class: 'banner rojo', role: 'alert' },
    el('strong', { text: `✖ Alerta del DHN: boletín de sismo/tsunami ${b.numero}` }),
    el('p', { text: 'Todas las playas figuran en rojo. No salgas al mar: revisa dhn.mil.pe o la app MGP Tsunamis.' }),
    el('details', {}, el('summary', { text: 'Texto del boletín' }), el('pre', { text: b.textoCrudo })));
}

function bannerOleaje(resultados) {
  const alerta = alertaOleaje(resultados);
  if (!alerta) return null;
  return el('section', { class: 'banner rojo', role: 'alert' },
    el('strong', { text: `✖ Oleaje ${alerta.nivel} según el DHN` }),
    el('p', { text: 'Hay horas de este día con oleaje anómalo fuerte: esas horas figuran en rojo.' }));
}

function bannerDhn() {
  const { dhn, ahoraMs, config } = estado;
  const e = estadoDhn(dhn, ahoraMs, config.umbrales);
  if (e === 'ok') return null;
  const mensajes = {
    ausente: 'No pude cargar los datos del DHN.',
    obsoleto: `Los datos del DHN llevan más de ${config.umbrales.horasMaxDhn} horas sin actualizarse.`,
    errorParseo: 'No pude leer el último aviso del DHN.',
  };
  const crudo = dhn?.avisoCrudo;
  return el('section', { class: 'banner amarillo', role: 'status' },
    el('strong', { text: `⚠ ${mensajes[e]}` }),
    el('p', { text: 'Ninguna playa pasa de amarillo hasta que revises el aviso en dhn.mil.pe.' }),
    crudo ? el('details', {}, el('summary', { text: crudo.titulo }), el('pre', { text: crudo.texto })) : null);
}

function pestanas() {
  const etiquetas = ['Hoy', 'Mañana', 'Pasado'];
  return el('nav', { class: 'dias', 'aria-label': 'Día' }, etiquetas.map((t, i) => {
    const b = el('button', { type: 'button', text: `${t} · ${fechaCorta(Date.parse(`${fechaDelDia(i)}T12:00:00-05:00`))}`, 'aria-pressed': String(i === estado.dia) });
    b.addEventListener('click', () => { estado.dia = i; pintar(); });
    return b;
  }));
}

function mejorOpcion(resultados) {
  const dia = estadoDia(resultados);
  if (dia.tipo === 'sin-mar') {
    return el('section', { class: 'mejor ninguna' }, el('h2', { text: 'No pude obtener el mar ahora' }), el('p', { text: 'No hay semáforo sin datos de oleaje y viento. Reintenta en unos minutos.' }));
  }
  if (dia.tipo === 'sin-horas') {
    return el('section', { class: 'mejor sin-horas' }, el('h2', { text: 'Ya no quedan horas suficientes hoy' }), el('p', { text: 'La ventana de remo es de 6 a 17 h y hacen falta al menos 2 horas seguidas. Mira Mañana.' }));
  }
  if (dia.tipo === 'ninguna') {
    // Sin bloque apto no se "juzga": se describe el mar con la escala de colores y se explica la causa.
    // Con olas bajas pero viento o ráfagas que lo impiden, el titular dice la causa y usa su color.
    const d = dia.grado ? describirSinBloque(dia.grado, dia.limitante) : { color: 'rojo', titulo: 'Sin bloque apto' };
    return el('section', { class: `mejor ${d.color}` },
      el('h2', { text: `${SIMBOLO[d.color]} ${d.titulo}` }),
      el('p', { text: dia.causa ?? 'No hay un bloque de 2 horas o más para remar en mar calmo.' }));
  }
  const mejor = dia.mejor;
  return el('section', { class: `mejor ${mejor.color}` },
    el('p', { class: 'sobre', text: 'Mejor opción' }),
    el('h2', { text: `${SIMBOLO[mejor.color]} ${mejor.playa.nombre} · ${mejor.bloque.desde}–${mejor.bloque.hasta} h` }));
}

// Con bloque: su horario y color. Sin bloque: el grado del mar (Mar movido, etc.) con su color.
function chipDePlaya(r) {
  if (r.estado !== 'ok') return el('span', { class: 'chip gris', text: ETIQUETA_ESTADO[r.estado] });
  if (r.bloque) {
    return el('span', { class: `chip ${r.color}`, text: `${SIMBOLO[r.color]} ${r.bloque.desde}–${r.bloque.hasta} h` });
  }
  const d = r.grado ? describirSinBloque(r.grado, r.limitante) : { color: r.color, chip: ETIQUETA[r.color] };
  return el('span', { class: `chip ${d.color}`, text: `${SIMBOLO[d.color]} ${d.chip}` });
}

function nivelDePlaya(playa, oleaje) {
  const grupo = oleaje?.grupos.find((g) => g.playas.includes(playa.nombre));
  if (!grupo?.nivelMax) return null;
  const etiqueta = ETIQUETA_NIVEL[grupo.nivelMax];
  return el('small', { class: `nivel ${colorNivel(grupo.nivelMax)}`, text: `Oleaje ${etiqueta.toLowerCase()}` });
}

function notaFactor(r) {
  const salidasPlaya = estado.salidas.filter((s) => s.playaId === r.playa.id).length;
  if (r.aprendido) {
    return `Ola en tu zona = ola del modelo × ${coma(r.aprendido.factor)}, aprendido de tus ${r.aprendido.n} salidas (el config dice ${coma(r.playa.factorOla ?? 1)}).`;
  }
  return `Ola en tu zona = ola del modelo × ${coma(r.playa.factorOla ?? 1)} (del config). Registra cómo estaba el mar en 3 salidas para calibrarlo: llevas ${salidasPlaya}.`;
}

function notaExposicion(r) {
  const exposiciones = r.horas.map((h) => h.dato.exposicion).filter(Boolean);
  if (!exposiciones.length) return null;
  const minima = Math.min(...exposiciones);
  return el('p', { class: 'nota gris', text: `La ola llega de costado o de espaldas a esta playa: cuenta como ${Math.round(minima * 100)} % de la del modelo (además del factor).` });
}

function lineaMareas(r) {
  if (!r.mareas.length) return null;
  const texto = r.mareas
    .map((m) => `${m.tipo === 'pleamar' ? 'Pleamar' : 'Bajamar'} ${m.hora} h (${num1(m.nivel)} m)`)
    .join(' · ');
  return el('p', { class: 'mareas gris', text: `Mareas: ${texto}` });
}

function registrar(playa, indice, impresion) {
  const fecha = fechaDelDia(0);
  const { config } = estado;
  const hsBase = hsBaseDelDia(estado.mar[indice] ?? [], fecha, config.ventana, playa.orientacion, config.umbrales);
  estado.salidas = agregarSalida(estado.salidas, nuevaSalida({ playaId: playa.id, fecha, impresion, hsBase }));
  estado.mensajeSalidas = guardarSalidas(almacen(), estado.salidas)
    ? ''
    : 'No pude guardar en este navegador (¿modo privado?). Exporta tus salidas para no perderlas.';
  estado.abiertas.add(playa.id);
  pintar();
}

function bloqueRegistro(r) {
  if (estado.dia !== 0) return null;
  const hoy = fechaDelDia(0);
  const ya = estado.salidas.find((s) => s.playaId === r.playa.id && s.fecha === hoy);
  return el('div', { class: 'registro' },
    el('p', { text: ya ? `Registrado hoy: ${IMPRESIONES[ya.impresion].etiqueta}. Puedes cambiarlo:` : '¿Cómo estaba el mar hoy en tu zona de remo?' }),
    Object.entries(IMPRESIONES).map(([clave, { etiqueta }]) => {
      const b = el('button', { type: 'button', text: etiqueta, 'aria-pressed': String(ya?.impresion === clave) });
      b.addEventListener('click', () => registrar(r.playa, r.indice, clave));
      return b;
    }));
}

function tarjeta(r, oleaje) {
  if (r.estado === 'sin-mar') {
    return el('article', { class: 'playa sin-datos' }, el('h3', { text: r.playa.nombre }), el('p', { text: 'No pude obtener el mar ahora. Reintenta más tarde.' }));
  }
  const resumen = el('summary', {},
    el('span', { class: 'nombre', text: r.playa.nombre },
      nivelDePlaya(r.playa, oleaje)),
    chipDePlaya(r));
  const filas = r.horas.map((h) => el('tr', { class: h.color },
    el('td', { text: `${String(Number(h.hora.slice(11, 13)))} h` }),
    el('td', {},
      h.dato.hs === null ? '—' : `${num1(h.dato.hs)} m`,
      h.dato.hsModelo ? el('small', { class: 'gris', text: ` (modelo ${num1(h.dato.hsModelo)})` }) : null),
    el('td', { text: h.dato.tp === null ? '—' : `${num1(h.dato.tp)} s` }),
    el('td', {},
      h.dato.vientoKmh === null ? '—' : `${Math.round(h.dato.vientoKmh)} km/h`,
      typeof h.dato.rafagaKmh === 'number' ? el('small', { class: 'gris', text: ` ráf. ${Math.round(h.dato.rafagaKmh)}` }) : null),
    el('td', { text: `${SIMBOLO[h.color]} ${motivoHora(h) || 'Verde'}` })));
  const detalles = el('details', estado.abiertas.has(r.playa.id) ? { open: '' } : {}, resumen,
    el('p', { class: 'motivo', text: r.motivo }),
    el('p', { class: 'nota gris', text: notaFactor(r) }),
    notaExposicion(r),
    ...r.notas.map((n) => el('p', { class: 'nota', text: n })),
    lineaMareas(r),
    r.horas.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Hora', 'Ola', 'Periodo', 'Viento', 'Estado / motivo'].map((t) => el('th', { text: t })))), el('tbody', {}, filas)) : null,
    bloqueRegistro(r));
  detalles.addEventListener('toggle', () => {
    if (detalles.open) estado.abiertas.add(r.playa.id);
    else estado.abiertas.delete(r.playa.id);
  });
  return el('article', { class: 'playa' }, detalles);
}

function exportarSalidas() {
  const blob = new Blob([JSON.stringify(estado.salidas, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `salidas-boletin-olas-${fechaDelDia(0)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importarSalidas(archivo) {
  try {
    const antes = estado.salidas.length;
    estado.salidas = fusionar(estado.salidas, JSON.parse(await archivo.text()));
    const guardado = guardarSalidas(almacen(), estado.salidas);
    estado.mensajeSalidas = `Importadas. Ahora tienes ${estado.salidas.length} salidas (${estado.salidas.length - antes} nuevas).${guardado ? '' : ' No pude guardarlas en este navegador.'}`;
  } catch (e) {
    estado.mensajeSalidas = `No pude importar el archivo: ${e.message}`;
  }
  pintar();
}

function panelSalidas() {
  const exportar = el('button', { type: 'button', text: 'Exportar' });
  exportar.addEventListener('click', exportarSalidas);
  const entrada = el('input', { type: 'file', accept: 'application/json,.json', class: 'oculto' });
  entrada.addEventListener('change', () => { if (entrada.files[0]) importarSalidas(entrada.files[0]); });
  const importar = el('label', { class: 'boton' }, 'Importar', entrada);
  return el('section', { class: 'salidas' },
    el('h2', { text: 'Tus salidas' }),
    el('p', { class: 'gris', text: `${estado.salidas.length} registradas en este navegador. Exporta de vez en cuando: si borras los datos del sitio se pierden.` }),
    el('p', {}, exportar, importar),
    estado.mensajeSalidas ? el('p', { class: 'nota', role: 'status', text: estado.mensajeSalidas }) : null);
}

function pie(tsun) {
  const { dhn, marMs } = estado;
  const aviso = dhn?.aviso;
  const lineas = [];
  if (aviso) {
    lineas.push(el('p', {}, `DHN: aviso ${aviso.numero}, válido hasta el ${aviso.validoHasta.split('-').reverse().join('/')}. `, el('a', { href: aviso.url, text: 'Ver aviso', rel: 'noopener' })));
  }
  if (tsun.estado === 'informativo') {
    const b = tsun.boletin;
    lineas.push(el('p', { class: 'gris', text: `Sismo ${b.magnitud ?? '?'} Mw ${b.lugar ?? ''}: sin tsunami en el litoral peruano (boletín ${b.numero}).` }));
  }
  lineas.push(el('p', { class: 'gris', text: `Datos del DHN leídos: ${dhn ? `${fechaCorta(Date.parse(dhn.generadoEn))} ${horaCorta(Date.parse(dhn.generadoEn))}` : 'no disponible'} · Mar consultado: ${horaCorta(marMs)}` }));
  lineas.push(el('p', { class: 'gris', text: 'Oleaje, viento, ráfagas y mareas son de modelo (Open-Meteo), no medidos en la orilla; varias playas pueden compartir la misma celda del modelo. Es una ayuda para decidir, no un permiso: manda lo que veas en la orilla y cualquier cierre de puerto. Antes de salir revisa dhn.mil.pe o la app MGP Tsunamis.' }));
  lineas.push(el('p', { class: 'gris' },
    el('a', { href: 'https://www.dhn.mil.pe/portal/', text: 'dhn.mil.pe', rel: 'noopener' }), ' · ',
    el('a', { href: 'https://www.dhn.mil.pe/portal/boletin-diario-condiciones-oceanograficas', text: 'Boletín oceanográfico diario', rel: 'noopener' }), ' · ',
    el('a', { href: 'https://www.dhn.mil.pe/portal/boletin-sismo-tsunami', text: 'Sismo y tsunami', rel: 'noopener' })));
  return el('footer', {}, lineas);
}

function mostrarError(e) {
  document.getElementById('app').replaceChildren(el('section', { class: 'banner rojo', role: 'alert' }, el('strong', { text: 'No pude iniciar la página.' }), el('p', { text: String(e.message) })));
}

iniciar().catch(mostrarError);

// Si la pestaña queda abierta de un día para otro, "Hoy" se recarga solo con los datos del nuevo día.
setInterval(() => {
  if (estado.diaCargado && ahoraLima(Date.now()).slice(0, 10) !== estado.diaCargado) {
    estado.dia = 0;
    iniciar().catch(mostrarError);
  }
}, 60_000);
