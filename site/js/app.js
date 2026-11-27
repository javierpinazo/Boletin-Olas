import { cargarMar, cargarMarVarias, horasDelDia, ahoraLima, mareasDelDia } from './mar.js';
import {
  evaluarPlayaDia, evaluarTsunami, estadoDhn, estadoDia, resultadoSinMar, alertaOleaje, resumenOleajeDia, ETIQUETA_NIVEL,
  describirSinBloque, motivoHora, gradoMar, colorRafaga, COLOR_GRADO, ETIQUETA_GRADO,
} from './score.js';
import {
  IMPRESIONES, IMPRESIONES_VIENTO, nuevaSalida, agregarSalida, factorAprendidoDePlaya, factorVientoAprendido, fusionar,
  hsBaseDelDia, vientoBaseDelDia, leerSalidas, guardarSalidas,
} from './salidas.js';
import { NOMBRES as FASES, posicionCiclo, indiceFase, iluminacion, tipoMarea, proximas, trazoLuz } from './luna.js';
import { textoResumen, enlaceWhatsapp, dibujarTarjeta } from './compartir.js';
import { conCache, leerCache, guardarCache, podarCache } from './cache.js';
import { cercanas, zonasDe, conGrifos } from './catalogo.js';
import { leerMisPlayas, playasAVer, guardarMisPlayas } from './mis-playas.js';
import { panelSelector } from './selector.js';
import { leerPromocion, enlaceDe, promocionSinAlertas } from './promocion.js';
import { barraVisible } from './barra-marca.js';

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
    else if (k === 'alto') nodo.style.height = v; // vía CSSOM: el CSP no permite el atributo style
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
  actualizando: false, ultimoRefresco: 0, tempMar: null, climaMar: null, grifos: null, salidas: [], abiertas: new Set(), mensajeSalidas: '',
  // Mis playas: catálogo completo, ids elegidos y estado del panel para elegirlas.
  catalogo: null, ids: null, selector: false, consulta: '', cerca: null, ubicando: false, mensajeSelector: '', turno: 0,
};

// Uso frecuente: lo pedido hace menos de 30 min (Open-Meteo, temperatura, grifos, clima) sale de la caché del
// navegador sin volver a pedirse. El aviso del DHN se lee siempre (es un archivo pequeño y trae las alertas de
// tsunami, que no deben esperar). Todo se pide en paralelo.
async function iniciar({ forzar = false } = {}) {
  const turno = (estado.turno += 1); // si empieza otra carga, el resultado de esta se descarta
  const raiz = document.getElementById('app');
  if (!estado.selector) raiz.replaceChildren(el('p', { class: 'cargando', text: 'Consultando el mar y el aviso del DHN…' }));
  const a = almacen();
  const [config, catalogo] = await Promise.all([cargarJson('./config.json'), cargarJson('./playas.json')]);
  // estado.ids es lo que el remero eligió; si todavía no eligió, se muestran las playas de ejemplo.
  estado.ids ??= leerMisPlayas(a, catalogo.playas.map((p) => p.id));
  const playas = playasAVer(estado.ids).map((id) => catalogo.playas.find((p) => p.id === id)).filter(Boolean);
  const json = (clave, url) => conCache(a, clave, () => cargarJson(url), { forzar }).then((r) => r.datos).catch(() => null);
  const claveMar = `mar:${playas.map((p) => `${p.lat},${p.lon}`).join(';')}`;
  const [dhn, tempMar, climaMar, grifos, mar] = await Promise.all([
    cargarJson('./data/dhn.json').catch(() => null),
    json('temp-mar-zonas', './data/temp-mar.json'),
    json('clima-mar-zonas', './clima-mar.json'),
    json('grifos', './data/grifos.json'),
    // Todas las playas en una sola consulta por API; si esa falla, playa por playa (una mala no tumba a las demás).
    !playas.length ? null : conCache(a, claveMar, () => cargarMarVarias(playas).catch(async () => {
      const sueltas = await Promise.allSettled(playas.map((p) => cargarMar(p)));
      if (sueltas.every((s) => s.status === 'rejected')) throw sueltas[0].reason;
      return sueltas.map((s) => (s.status === 'fulfilled' ? s.value : null));
    }), { forzar }).catch(() => null),
  ]);
  if (turno !== estado.turno) return;
  // Con el mar de la selección actual ya guardado, sobra el de selecciones anteriores (cada uno ocupa bastante).
  if (mar && !mar.vencido) podarCache(a, claveMar);
  // Playas y datos del mar se asignan juntos: van emparejados por posición.
  Object.assign(estado, { catalogo, config: { ...config, playas }, dhn, tempMar, climaMar, grifos });
  estado.mar = mar?.datos ?? playas.map(() => null);
  estado.salidas = leerSalidas(a);
  estado.ahoraMs = Date.now();
  estado.marMs = mar?.t ?? estado.ahoraMs;
  estado.sinConexion = Boolean(mar?.vencido);
  estado.diaCargado = ahoraLima(estado.ahoraMs).slice(0, 10);
  pintar();
  refrescar({ forzar });
}

// Pide a la VPS que relea el DHN y la temperatura del mar. El servidor decide: solo lo hace si el último dato
// tiene 3 h o más (además del cron diario de las 6 a. m.). Si lo hizo, se vuelven a leer los archivos.
// Si este navegador ya se lo pidió hace menos de 30 min, no se vuelve a pedir.
async function refrescar({ forzar = false } = {}) {
  const a = almacen();
  estado.ultimoRefresco = Date.now();
  if (!forzar && leerCache(a, 'api-actualizar')) return;
  estado.actualizando = estadoDhn(estado.dhn, estado.ahoraMs, estado.config.umbrales) !== 'ok';
  if (estado.actualizando) pintar();
  try {
    const r = await fetch('/api/actualizar', { cache: 'no-store', signal: AbortSignal.timeout(100_000) });
    if (r.ok) guardarCache(a, 'api-actualizar', true);
    if (r.ok && (await r.json()).actualizado) {
      const fresco = (clave, url, actual) => conCache(a, clave, () => cargarJson(url), { forzar: true }).then((x) => x.datos).catch(() => actual);
      estado.dhn = await cargarJson('./data/dhn.json').catch(() => estado.dhn);
      estado.tempMar = await fresco('temp-mar-zonas', './data/temp-mar.json', estado.tempMar);
      estado.grifos = await fresco('grifos', './data/grifos.json', estado.grifos);
      estado.ahoraMs = Date.now();
    }
  } catch {
    // sin servicio de actualización (p. ej. en local): se queda con lo que hay
  }
  estado.actualizando = false;
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
    // Con 3 o más salidas registradas en esta playa, sus factores de ola y de viento aprendidos reemplazan a los del config.
    const aprendido = factorAprendidoDePlaya(estado.salidas, playa);
    const aprendidoViento = factorVientoAprendido(estado.salidas, playa.id);
    const horas = estado.mar[i];
    const playaFactores = {
      ...playa,
      ...(aprendido ? { factorOla: aprendido.factor } : {}),
      ...(aprendidoViento ? { factorViento: aprendidoViento.factor } : {}),
    };
    const evaluar = (desdeMs) => evaluarPlayaDia({
      playa: playaFactores,
      horasCrudas: horasDelDia(horas, fecha, config.ventana, desdeMs),
      aviso: dhn?.aviso ?? null,
      dhn,
      ahoraMs,
      config,
      tsunamiAlerta: tsun.estado === 'alerta',
    });
    const base = horas ? evaluar(ahoraMs) : resultadoSinMar(playa);
    // Para los gráficos se muestra el día completo (incluidas las horas ya pasadas); el veredicto usa solo lo que queda.
    const horasDia = horas ? evaluar(Date.parse(`${fecha}T00:00:00-05:00`)).horas : [];
    return { ...base, horasDia, playa, indice: i, aprendido, aprendidoViento, mareas: horas ? mareasDelDia(horas, fecha) : [] };
  });
  const oleaje = resumenOleajeDia({
    aviso: dhn?.aviso ?? null, playas: config.playas, fecha, ventana: config.ventana,
  });
  return { tsun, resultados, oleaje };
}

// Leve / Medio / Alto del DHN con el color del semáforo (ligero verde, moderado amarillo, fuerte rojo).
const COLOR_NIVEL = { normal: 'verde', ligero: 'verde', moderado: 'amarillo', fuerte: 'rojo', 'muy fuerte': 'rojo' };
const colorNivel = (nivel) => COLOR_NIVEL[nivel] ?? 'gris';

// Medidor del oleaje anómalo: 4 escalones (Normal / Leve / Medio / Alto) con el del día resaltado.
// Sin aviso, o con aviso "condiciones normales", el día es normal.
const PASOS_OLEAJE = [['normal', 'Oleaje Normal', 'verde'], ['ligero', 'Leve', 'verde'], ['moderado', 'Medio', 'amarillo'], ['fuerte', 'Alto', 'rojo']];

// Nivel de oleaje anómalo del día según el aviso del DHN (lo usan el bloque y "Comparte el día").
function infoOleaje(oleaje) {
  const { dhn, ahoraMs, config } = estado;
  const sinDatos = !oleaje && estadoDhn(dhn, ahoraMs, config.umbrales) !== 'ok';
  const orden = ['normal', 'ligero', 'moderado', 'fuerte', 'muy fuerte'];
  const nivelDia = oleaje
    ? oleaje.grupos.map((g) => g.nivelMax).filter(Boolean).reduce((a, b) => (orden.indexOf(b) > orden.indexOf(a) ? b : a), 'normal')
    : 'normal';
  const normal = nivelDia === 'normal';
  const unico = oleaje && oleaje.grupos.every((g) => g.texto === oleaje.grupos[0].texto);
  return { sinDatos, nivelDia, normal, unico };
}

function bloqueOleaje(oleaje) {
  const { sinDatos, nivelDia, normal } = infoOleaje(oleaje);
  const actual = nivelDia === 'muy fuerte' ? 'fuerte' : nivelDia;
  const color = colorNivel(nivelDia);
  const titular = sinDatos
    ? 'Sin datos del aviso del DHN'
    : normal ? 'Día normal: sin oleaje anómalo' : `Oleaje anómalo ${ETIQUETA_NIVEL[nivelDia].toLowerCase()}`;
  const subtitulo = sinDatos
    ? 'Revisa dhn.mil.pe antes de salir.'
    : normal
      ? 'El DHN no tiene avisos de oleaje anómalo para este día.'
      : null;
  const medidor = el('div', { class: 'medidor', role: 'img', 'aria-label': `Oleaje anómalo: ${titular}` },
    PASOS_OLEAJE.map(([clave, texto, c]) => el('span', { class: `paso ${c}${!sinDatos && clave === actual ? ' activo' : ''}`, text: texto })));
  const unico = oleaje && oleaje.grupos.every((g) => g.texto === oleaje.grupos[0].texto);
  const detalle = !oleaje || normal
    ? []
    : (unico ? [{ ...oleaje.grupos[0], playas: null }] : oleaje.grupos).map((g) => el('p', { class: 'grupo' },
      g.playas ? el('span', { class: 'gris', text: `${g.playas.join(', ')}: ` }) : null,
      el('span', { text: g.texto })));
  return el('section', { class: `oleaje ${sinDatos ? 'gris' : color}` },
    el('h2', { text: 'Oleaje anómalo (DHN)' }),
    el('p', { class: 'titular', text: `${sinDatos ? '⚠' : SIMBOLO[color]} ${titular}` }),
    subtitulo ? el('p', { class: 'gris', text: subtitulo }) : null,
    medidor,
    detalle);
}

// Temperatura del mar (NOAA OISST) frente a lo habitual de ese día del año (media 1991–2020).
const diaDelAnio = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${iso.slice(0, 4)}-01-01T00:00:00Z`)) / 864e5);

function bloqueTemperatura() {
  const { tempMar, climaMar, config } = estado;
  if (!tempMar || !climaMar) return null;
  const medidas = zonasDe(config.playas).map((zona) => {
    const t = tempMar.zonas?.[zona];
    const normal = climaMar.zonas?.[zona]?.[t ? diaDelAnio(t.fecha) : 0];
    return t && typeof normal === 'number' ? { actual: t.actual, normal, fecha: t.fecha, fuente: t.fuente ?? 'oisst' } : null;
  }).filter(Boolean);
  if (!medidas.length) return null;
  const prom = (k) => medidas.reduce((s, m) => s + m[k], 0) / medidas.length;
  const actual = prom('actual');
  const normal = prom('normal');
  const dif = Math.round((actual - normal) * 10) / 10;
  const diasAtraso = Math.floor((Date.now() - Date.parse(`${medidas[0].fecha}T12:00:00-05:00`)) / 864e5);
  const tono = dif >= 0.5 ? 'calido' : dif <= -0.5 ? 'frio' : 'normal';
  const titular = tono === 'normal'
    ? 'Dentro de lo habitual'
    : `${num1(Math.abs(dif))} °C ${tono === 'calido' ? 'más cálido' : 'más frío'} de lo habitual`;
  // Escala simétrica respecto a lo habitual: empieza en ±4 °C y crece de 2 en 2 (6, 8, 10…) si la diferencia la supera.
  const limite = Math.max(4, Math.ceil(Math.abs(dif) / 2) * 2);
  const posicion = Math.max(0, Math.min(100, 50 + (dif / limite) * 50));
  const marca = el('span', { class: 'marca' });
  marca.style.left = `${posicion}%`;
  return el('section', { class: `temperatura ${tono}` },
    el('h2', { text: 'Temperatura del mar' }),
    el('div', { class: 'temp-cifras' },
      el('div', {}, el('span', { class: 'grande', text: `${num1(actual)} °C` }), el('span', { class: 'etiqueta', text: 'Actual' })),
      el('div', {}, el('span', { class: 'grande suave', text: `${num1(normal)} °C` }), el('span', { class: 'etiqueta', text: 'Habitual' })),
      el('div', {}, el('span', { class: 'grande dif', text: `${dif > 0 ? '+' : ''}${num1(dif)} °C` }), el('span', { class: 'etiqueta', text: 'Diferencia' }))),
    el('p', { class: 'titular', text: titular }),
    el('div', { class: 'escala', role: 'img', 'aria-label': `${titular}` }, marca),
    el('div', { class: 'escala-rotulos' }, el('span', { text: `−${limite} °C` }), el('span', { text: 'habitual' }), el('span', { text: `+${limite} °C` })),
    graficoHistorico(),
    el('p', { class: 'gris pequeno', text: `${medidas.every((m) => m.fuente === 'openmeteo') ? 'Dato del modelo Open-Meteo, usado porque NOAA no respondió' : 'Lectura satelital (NOAA OISST, preliminar)'} del ${fechaCorta(Date.parse(`${medidas[0].fecha}T12:00:00-05:00`))}; habitual = promedio 1991–2020 de ese día. Referencia de la zona, mar abierto frente a la costa: en la orilla puede variar.` }),
    diasAtraso > 7 ? el('p', { class: 'nota', text: `Atención: el último dato de temperatura del mar tiene ${diasAtraso} días.` }) : null);
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...hijos) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...hijos.filter(Boolean));
  return n;
}

// Últimos días: temperatura real (línea) frente a la habitual de cada día (línea punteada), promedio de las playas.
function graficoHistorico() {
  const { tempMar, climaMar, config } = estado;
  const porFecha = new Map();
  for (const zona of zonasDe(config.playas)) {
    for (const [fecha, sst] of tempMar.zonas?.[zona]?.serie ?? []) {
      const normal = climaMar.zonas?.[zona]?.[diaDelAnio(fecha)];
      if (typeof normal !== 'number') continue;
      const a = porFecha.get(fecha) ?? { sst: 0, normal: 0, n: 0 };
      a.sst += sst; a.normal += normal; a.n += 1;
      porFecha.set(fecha, a);
    }
  }
  const puntos = [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, a]) => ({ fecha, sst: a.sst / a.n, normal: a.normal / a.n }));
  if (puntos.length < 5) return null;
  const todos = puntos.flatMap((p) => [p.sst, p.normal]);
  const min = Math.floor(Math.min(...todos)) - 1;
  const max = Math.ceil(Math.max(...todos)) + 1;
  const W = 300; const H = 90;
  const x = (i) => Math.round((i / (puntos.length - 1)) * W * 10) / 10;
  const y = (v) => Math.round((H - ((v - min) / (max - min)) * H) * 10) / 10;
  const linea = (campo) => puntos.map((p, i) => `${x(i)},${y(p[campo])}`).join(' ');
  const area = `${linea('sst')} ${W},${y(puntos[puntos.length - 1].normal)} ${[...puntos].reverse().map((p, i) => `${x(puntos.length - 1 - i)},${y(p.normal)}`).join(' ')}`;
  const dibujo = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'historico', role: 'img', 'aria-label': 'Temperatura del mar de los últimos días frente a la habitual', preserveAspectRatio: 'none' },
    svg('polygon', { points: area, class: 'area' }),
    svg('polyline', { points: linea('normal'), class: 'l-normal', fill: 'none' }),
    svg('polyline', { points: linea('sst'), class: 'l-actual', fill: 'none' }));
  const f = (iso) => fechaCorta(Date.parse(`${iso}T12:00:00-05:00`));
  return el('div', { class: 'historico-caja' },
    el('p', { class: 'gris pequeno', text: `Últimos ${puntos.length} días: línea continua = real, punteada = habitual. Eje de ${min} a ${max} °C.` }),
    dibujo,
    el('div', { class: 'escala-rotulos' }, el('span', { text: f(puntos[0].fecha) }), el('span', { text: f(puntos[puntos.length - 1].fecha) })));
}

function pintar() {
  const raiz = document.getElementById('app');
  // Al repintar se devuelve el foco al mismo control del panel (y el cursor, si era el campo de búsqueda).
  const activo = document.activeElement;
  const foco = activo?.getAttribute?.('data-foco');
  const cursor = foco === 'buscar-playa' ? activo.selectionStart : null;
  const fecha = document.getElementById('fecha-hoy');
  if (fecha) fecha.textContent = fmt(estado.ahoraMs, { weekday: 'long', day: 'numeric', month: 'long' });
  raiz.replaceChildren(...piezas().filter(Boolean));
  if (!foco) return;
  const nodo = raiz.querySelector(`[data-foco="${foco}"]`);
  if (!nodo || nodo.disabled) return;
  nodo.focus({ preventScroll: true });
  if (cursor !== null) nodo.setSelectionRange?.(cursor, cursor);
}

function piezas() {
  const { tsun, resultados, oleaje } = evaluarTodo();
  const oceano = esOceano();
  // Mismo orden en los dos temas; el océano solo agrega sus piezas propias después de las playas.
  const mejorId = oceano ? estadoDia(resultados).mejor?.playa.id : null;
  // Sin playas propias, el aviso (y el panel que abre) va arriba, a la vista.
  const sinElegir = !estado.ids.length;
  const misPlayas = estado.selector ? selectorPlayas() : sinElegir ? avisoPlayasDeEjemplo() : botonMisPlayas();
  const tsunami = bannerTsunami(tsun);
  const sinConexion = bannerSinConexion();
  const dhnViejo = bannerDhn();
  const oleajeFuerte = bannerOleaje(resultados);
  const alertas = [tsunami, sinConexion, dhnViejo, oleajeFuerte];
  return [
    tarjetaPromocion(promocionSinAlertas(leerPromocion(estado.config), alertas)),
    tsunami,
    sinElegir ? misPlayas : null,
    barraLuna(),
    sinConexion,
    bannerActualizando(),
    dhnViejo,
    oleajeFuerte,
    sinElegir ? null : misPlayas,
    pestanas(),
    bloqueOleaje(oleaje),
    bloqueTemperatura(),
    oceano ? titularOceano(resultados) : mejorOpcion(resultados),
    ...resultados.map((r) => {
      const t = tarjeta(r, oleaje);
      if (r.playa.id === mejorId) t.classList.add('destacada');
      return t;
    }),
    oceano ? cuadroHoras(resultados) : null,
    oceano ? compartirDia(resultados, oleaje) : null,
    oceano ? instalarApp() : null,
    panelSalidas(),
    seccionGrifos(),
    pie(tsun),
  ];
}

// ---------- Mis playas ----------
function abrirSelector() {
  estado.selector = true;
  pintar();
}

function avisoPlayasDeEjemplo() {
  const b = el('button', { type: 'button', class: 'boton-mis-playas', 'data-foco': 'mis-playas', text: '📍 Elegir mis playas' });
  b.addEventListener('click', abrirSelector);
  return el('section', { class: 'playas-ejemplo' },
    el('p', {}, el('strong', { text: 'Estás viendo playas de Lima y Callao' }),
      el('span', { class: 'gris', text: 'Elige las tuyas por nombre o cerca de ti.' })),
    b);
}

function botonMisPlayas() {
  const b = el('button', { type: 'button', class: 'boton-mis-playas', 'data-foco': 'mis-playas', text: '📍 Mis playas · agregar o cambiar' });
  b.addEventListener('click', abrirSelector);
  return b;
}

function selectorPlayas() {
  estado.selector = true;
  return panelSelector({
    el,
    catalogo: estado.catalogo,
    ids: estado.ids,
    consulta: estado.consulta,
    cerca: estado.cerca,
    ubicando: estado.ubicando,
    hayCargadas: estado.config.playas.length > 0,
    mensaje: estado.mensajeSelector,
    alCambiar: cambiarMisPlayas,
    alBuscar: (texto) => { estado.consulta = texto; estado.cerca = null; },
    alUbicar: ubicar,
    alCerrar: cerrarSelector,
  });
}

function cambiarMisPlayas(ids) {
  estado.ids = ids;
  estado.mensajeSelector = guardarMisPlayas(almacen(), ids)
    ? ''
    : 'No pude guardar en este navegador: tu selección dura mientras la página esté abierta.';
  pintar();
}

function cerrarSelector() {
  Object.assign(estado, { selector: false, consulta: '', cerca: null, mensajeSelector: '' });
  const cargadas = estado.config.playas.map((p) => p.id).join();
  if (cargadas === playasAVer(estado.ids).join()) pintar();
  else iniciar().catch(mostrarError);
}

const ERROR_UBICACION = {
  1: 'No diste permiso para usar la ubicación. Puedes activarlo en el navegador o buscar tu playa por nombre.',
  2: 'No pude obtener tu ubicación (sin señal de GPS). Busca tu playa por nombre.',
  3: 'La ubicación tardó demasiado. Intenta de nuevo o busca tu playa por nombre.',
};

// La posición solo se usa para ordenar el catálogo aquí mismo: no se guarda ni se envía.
function ubicar() {
  if (!navigator.geolocation || window.isSecureContext === false) {
    estado.mensajeSelector = 'Este navegador no permite usar la ubicación aquí. Busca tu playa por nombre.';
    pintar();
    return;
  }
  Object.assign(estado, { ubicando: true, mensajeSelector: '' });
  pintar();
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      estado.ubicando = false;
      if (!estado.selector) return;
      estado.consulta = '';
      estado.cerca = cercanas(estado.catalogo.playas, { lat: coords.latitude, lon: coords.longitude });
      pintar();
    },
    (e) => {
      estado.ubicando = false;
      if (!estado.selector) return;
      estado.mensajeSelector = ERROR_UBICACION[e.code] ?? ERROR_UBICACION[2];
      pintar();
    },
    { timeout: 15000, maximumAge: 600000 },
  );
}

// ---------- Modo océano: piezas que solo existen en ese tema (presentación; la lógica es la misma) ----------
const esOceano = () => document.documentElement.getAttribute('data-tema') === 'oceano';
const NOMBRE_DIA = ['Hoy', 'Mañana', 'Pasado mañana'];

function titularOceano(resultados) {
  const dia = estadoDia(resultados);
  if (dia.tipo !== 'mejor') {
    const s = mejorOpcion(resultados);
    s.classList.add('titular-oceano');
    return s;
  }
  const { mejor } = dia;
  const cuidado = mejor.color !== 'verde';
  return el('section', { class: `titular-oceano ${cuidado ? 'cuidado' : 'apto'}` },
    el('p', { class: 'sobre', text: `${NOMBRE_DIA[estado.dia]} se puede remar${cuidado ? ' con cuidado' : ''}` }),
    el('h2', { text: `${mejor.playa.nombre}, de ${mejor.bloque.desde} a ${mejor.bloque.hasta} h` }));
}

function cuadroHoras(resultados) {
  const { config } = estado;
  const horas = [];
  for (let h = config.ventana.horaInicio; h < config.ventana.horaFin; h += 1) horas.push(h);
  const conDatos = resultados.filter((r) => r.horasDia.length);
  if (!conDatos.length) return null;
  const filas = conDatos.map((r) => {
    const porHora = new Map(r.horasDia.map((h) => [Number(h.hora.slice(11, 13)), h]));
    return el('div', { class: 'cuadro-fila', role: 'row' },
      el('span', { class: 'cuadro-nombre', role: 'rowheader', text: r.playa.nombre }),
      horas.map((h) => {
        const d = porHora.get(h);
        const color = d ? d.color : 'gris';
        return el('span', { class: `cuadro-celda ${color}`, role: 'cell', title: `${r.playa.nombre} ${h} h: ${d ? motivoHora(d) || 'Apto' : 'sin datos'}`, 'aria-label': `${h} h ${d ? ETIQUETA_OCEANO[color] ?? 'sin datos' : 'sin datos'}` });
      }));
  });
  const leyenda = (color, texto) => el('span', { class: 'cuadro-leyenda' }, el('span', { class: `cuadro-celda ${color}`, 'aria-hidden': 'true' }), texto);
  return el('section', { class: 'cuadro-horas', 'aria-label': 'Cuadro hora a hora de las playas' },
    el('h2', { text: 'Hora a hora' }),
    el('div', { class: 'cuadro', role: 'table' },
      el('div', { class: 'cuadro-fila cabeza', role: 'row' }, el('span', { role: 'columnheader' }), horas.map((h) => el('span', { role: 'columnheader', text: String(h) }))),
      filas),
    el('p', { class: 'cuadro-leyendas' }, leyenda('verde', 'Apto'), leyenda('amarillo', 'Con cuidado'), leyenda('rojo', 'No apto')));
}

const ETIQUETA_OCEANO = { verde: 'Apto', amarillo: 'Con cuidado', naranja: 'Con cuidado', rojo: 'No apto' };

// Cifras de una playa para compartir: lo que queda del día (o el día entero si ya pasó la ventana).
function detallePlaya(r) {
  const base = r.horas.length ? r.horas : r.horasDia;
  const olas = base.map((h) => h.dato.hs).filter((v) => typeof v === 'number');
  if (!olas.length) return {};
  const viento = Math.max(...base.map((h) => h.dato.vientoKmh ?? 0));
  const rafaga = Math.max(...base.map((h) => h.dato.rafagaKmh ?? h.dato.vientoKmh ?? 0));
  return { ola: `${num1(olas.reduce((a, b) => a + b, 0) / olas.length)} m`, viento: `${Math.round(viento)} km/h`, rafaga: `${Math.round(rafaga)} km/h` };
}

// Nivel del DHN en una palabra (Normal / Leve / Medio / Alto) con su color.
function fichaOleaje(oleaje) {
  const { sinDatos, nivelDia, normal } = infoOleaje(oleaje);
  if (sinDatos) return { texto: 'Sin datos', color: 'gris' };
  if (normal) return { texto: 'Normal', color: 'verde' };
  return { texto: ETIQUETA_NIVEL[nivelDia], color: colorNivel(nivelDia) };
}

function fichaTemperatura() {
  const { tempMar, climaMar, config } = estado;
  // Igual que el bloque de temperatura: promedio de las zonas de tus playas, actual frente a lo habitual de ese día.
  const medidas = zonasDe(config.playas).map((zona) => {
    const t = tempMar?.zonas?.[zona];
    return t ? { actual: t.actual, normal: climaMar?.zonas?.[zona]?.[diaDelAnio(t.fecha)] } : null;
  }).filter(Boolean);
  if (!medidas.length) return null;
  const actual = medidas.reduce((s, m) => s + m.actual, 0) / medidas.length;
  if (!medidas.every((m) => typeof m.normal === 'number')) return { actual: num1(actual), dif: null };
  const dif = Math.round((actual - medidas.reduce((s, m) => s + m.normal, 0) / medidas.length) * 10) / 10;
  return { actual: num1(actual), dif: `${dif > 0 ? '+' : dif < 0 ? '−' : '±'}${num1(Math.abs(dif))} °C` };
}

// Resumen del día para la imagen y el texto de "Comparte el día".
function resumenParaCompartir(resultados, oleaje) {
  const dia = estadoDia(resultados);
  const quien = NOMBRE_DIA[estado.dia];
  const titular = dia.tipo === 'mejor'
    ? (dia.mejor.color === 'verde' ? `${quien} sí\nse rema` : `${quien} se rema\ncon cuidado`)
    : dia.tipo === 'sin-horas' ? `${quien} ya no\nquedan horas` : `${quien} no\nconviene remar`;
  // En la imagen el color ya dice apto / con cuidado / no apto: el estado va corto (horario o una palabra).
  const estadoPlaya = (r) => {
    if (r.estado === 'sin-mar') return { color: 'gris', estado: 'Sin datos' };
    if (r.bloque) return { color: r.color, estado: `${r.bloque.desde}–${r.bloque.hasta} h` };
    if (r.estado !== 'ok') return { color: 'gris', estado: ETIQUETA_ESTADO[r.estado] };
    const d = r.grado ? describirSinBloque(r.grado, r.limitante) : { color: r.color, chip: ETIQUETA[r.color] };
    return { color: d.color, estado: ETIQUETA_OCEANO[d.color] ?? d.chip };
  };
  const playas = resultados.map((r) => ({ nombre: r.playa.nombre, ...estadoPlaya(r), ...(r.estado === 'sin-mar' ? {} : detallePlaya(r)) }));
  const ms = Date.parse(`${fechaDelDia(estado.dia)}T12:00:00-05:00`);
  const p = posicionCiclo(ms);
  return {
    fecha: fmt(ms, { weekday: 'long', day: 'numeric', month: 'short' }),
    titular,
    mejor: dia.tipo === 'mejor' ? `${dia.mejor.playa.nombre}, ${dia.mejor.bloque.desde}–${dia.mejor.bloque.hasta} h` : null,
    oleaje: fichaOleaje(oleaje),
    mar: fichaTemperatura(),
    playas,
    luna: { nombre: FASES[indiceFase(p)], p },
    url: location.origin,
    firma: { texto: estado.config.firma?.texto ?? 'Soluciones: Automatizate 360', url: estado.config.firma?.url || null },
  };
}

function compartirDia(resultados, oleaje) {
  const datos = resumenParaCompartir(resultados, oleaje);
  const lienzo = el('canvas', { class: 'tarjeta-compartir', role: 'img', 'aria-label': textoResumen(datos) });
  dibujarTarjeta(lienzo, datos);
  // Si la fuente de títulos aún no llegó, se redibuja cuando esté lista.
  // (el canvas no espera a las fuentes como el CSS: se cargan explícitamente)
  if (document.fonts?.load) {
    Promise.all(['700 100px "Space Grotesk"', '400 40px Inter', '700 40px Inter'].map((f) => document.fonts.load(f)))
      .then(() => dibujarTarjeta(lienzo, datos)).catch(() => {});
  }
  const nombreArchivo = `boletin-olas-${fechaDelDia(estado.dia)}.png`;
  const conImagen = (fn) => lienzo.toBlob((blob) => blob && fn(blob), 'image/png');
  const whatsapp = el('a', { class: 'boton-oceano verde', href: enlaceWhatsapp(datos), target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' });
  whatsapp.addEventListener('click', (e) => {
    // En el celular se comparte la imagen; si el navegador no puede, se abre WhatsApp con el texto.
    if (!navigator.canShare) return;
    e.preventDefault();
    conImagen(async (blob) => {
      const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
      try {
        if (navigator.canShare({ files: [archivo] })) await navigator.share({ files: [archivo], text: textoResumen(datos) });
        else window.open(enlaceWhatsapp(datos), '_blank', 'noopener');
      } catch { /* el usuario canceló */ }
    });
  });
  const guardar = el('button', { type: 'button', class: 'boton-oceano borde', text: 'Guardar imagen' });
  guardar.addEventListener('click', () => conImagen((blob) => {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nombreArchivo });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  return el('section', { class: 'compartir' },
    el('h2', { text: 'Comparte el día' }),
    el('p', { class: 'compartir-sub', text: 'Imagen en formato historia, lista para tu grupo de remo' }),
    lienzo,
    el('div', { class: 'compartir-botones' }, whatsapp, guardar));
}

let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  if (!esOceano()) return; // en el clásico el navegador se comporta como siempre
  e.preventDefault();
  eventoInstalar = e;
});

function instalarApp() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return null; // ya está instalada
  const ayuda = el('p', { class: 'instalar-ayuda', hidden: '', text: 'En Android: menú ⋮ del navegador › "Instalar app" o "Agregar a la pantalla principal". En iPhone: botón Compartir de Safari › "Agregar a inicio".' });
  const boton = el('button', { type: 'button', class: 'boton-instalar', text: 'Instalar' });
  boton.addEventListener('click', async () => {
    if (eventoInstalar) {
      eventoInstalar.prompt();
      await eventoInstalar.userChoice.catch(() => null);
      eventoInstalar = null;
    } else {
      ayuda.hidden = !ayuda.hidden;
    }
  });
  return el('section', { class: 'instalar' },
    el('div', { class: 'instalar-fila' },
      el('div', { class: 'instalar-texto' }, el('strong', { text: 'Tenla en tu pantalla de inicio' }), el('span', { text: 'Se abre como una app, sin tienda' })),
      boton),
    ayuda);
}

// ---------- Publicidad propia: identificada como tal y oculta cuando hay alertas ----------
function tarjetaPromocion(p) {
  if (!p) return null;
  return el('aside', { class: 'promocion', 'aria-label': 'Publicidad' },
    el('div', { class: 'promocion-textos' },
      el('span', { class: 'promocion-rotulo', text: p.rotulo }),
      el('span', { class: 'promocion-titulo', text: p.titulo })),
    el('a', { class: 'promocion-boton', href: enlaceDe(p, 'franja'), target: '_blank', rel: 'noopener noreferrer', text: p.boton }));
}

// ---------- Barra de marca: queda pegada arriba cuando la cabecera sale de la pantalla ----------
const cabecera = document.querySelector('.cabecera-sitio');
const barraMarca = document.getElementById('barra-marca');
function actualizarBarra() {
  if (!barraMarca) return; // página anterior aún en la caché del celular
  barraMarca.classList.toggle('visible', barraVisible(cabecera.getBoundingClientRect().bottom));
}
window.addEventListener('scroll', actualizarBarra, { passive: true });
window.addEventListener('resize', actualizarBarra);
actualizarBarra();

// ---------- Fases de la Luna (calculadas en el navegador; son informativas, no entran al semáforo) ----------
function discoLuna(p, r = 14) {
  const trazo = trazoLuz(p, r - 1);
  return svg('svg', { viewBox: `${-r} ${-r} ${r * 2} ${r * 2}`, class: 'disco-luna', 'aria-hidden': 'true' },
    svg('circle', { cx: 0, cy: 0, r: r - 1, class: 'oscuro' }),
    trazo ? svg('path', { d: trazo, class: 'luz' }) : null);
}

function barraLuna() {
  const ms = Date.parse(`${fechaDelDia(estado.dia)}T12:00:00-05:00`);
  const p = posicionCiclo(ms);
  const actual = indiceFase(p);
  const marea = tipoMarea(p);
  const sig = proximas(ms);
  const dia = (x) => fechaCorta(x);
  return el('section', { class: 'luna', 'aria-label': 'Fase de la Luna' },
    el('ul', { class: 'fases' }, FASES.map((nombre, i) => el('li', { class: i === actual ? 'fase actual' : 'fase', title: nombre, 'aria-current': i === actual ? 'true' : 'false' },
      discoLuna(i / 8),
      i === actual ? el('span', { class: 'flecha', 'aria-hidden': 'true', text: '▲' }) : null))),
    el('p', { class: 'luna-titular' }, el('strong', { text: FASES[actual] }), el('span', { class: 'gris', text: ` · ${Math.round(iluminacion(p) * 100)} % iluminada` })),
    el('p', { class: `luna-marea ${marea.tipo}`, text: marea.texto }),
    el('p', { class: 'gris pequeno', text: `Próxima luna nueva: ${dia(sig.nueva)} · próxima luna llena: ${dia(sig.llena)} · Cálculo aproximado; no cambia el semáforo.` }));
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

function bannerSinConexion() {
  if (!estado.sinConexion) return null;
  return el('section', { class: 'banner amarillo', role: 'status' },
    el('strong', { text: `⚠ Sin conexión: mar consultado el ${fechaCorta(estado.marMs)} a las ${horaCorta(estado.marMs)}` }),
    el('p', { text: 'Es el último pronóstico guardado en este celular. Revisa de nuevo cuando tengas señal.' }));
}

function bannerActualizando() {
  return estado.actualizando ? el('p', { class: 'gris', role: 'status', text: 'Actualizando los datos del DHN…' }) : null;
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
    return el('section', { class: 'mejor sin-horas' }, el('h2', { text: 'Ya no quedan horas suficientes hoy' }), el('p', { text: 'La ventana de remo es de 6 a 17 h y hacen falta al menos 2 horas seguidas. Mira Mañana. Abajo ves cómo estuvo el mar hoy.' }));
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
    const prefijo = esOceano() ? ETIQUETA_OCEANO[r.color] : SIMBOLO[r.color];
    return el('span', { class: `chip ${r.color}`, text: `${prefijo} ${r.bloque.desde}–${r.bloque.hasta} h` });
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
  const salidasPlaya = estado.salidas.filter((s) => s.playaId === r.playa.id && s.impresion).length;
  if (r.aprendido) {
    return `Ola en tu zona = ola del modelo × ${coma(r.aprendido.factor)}, aprendido de tus ${r.aprendido.n} salidas (sin tus salidas sería ${coma(r.playa.factorOla ?? 1)}).`;
  }
  if (r.playa.factorOlaDhn) {
    const f = r.playa.factorOlaDhn;
    return `Ola en tu zona = ola del modelo × un factor según el oleaje del DHN: normal o sin aviso vigente ${coma(f.normal)} · leve ${coma(f.ligero)} · medio ${coma(f.moderado)} · alto ${coma(f.fuerte)}. Si los datos del DHN no están al día, ${coma(f.sinDato)}. En esta playa tus registros de olas no cambian el factor.`;
  }
  if (r.playa.factorOla === undefined) {
    return `Sin calibrar: usa la ola completa del modelo, que suele ser mayor que en una zona protegida. Registra cómo estaba el mar en 3 salidas para ajustarlo: llevas ${salidasPlaya}.`;
  }
  return `Ola en tu zona = ola del modelo × ${coma(r.playa.factorOla)} (del catálogo). Registra cómo estaba el mar en 3 salidas para calibrarlo: llevas ${salidasPlaya}.`;
}

function notaViento(r) {
  const salidasPlaya = estado.salidas.filter((s) => s.playaId === r.playa.id && s.viento).length;
  if (r.aprendidoViento) {
    return `Viento en tu zona = viento del modelo × ${coma(r.aprendidoViento.factor)}, aprendido de tus ${r.aprendidoViento.n} salidas (sin tus salidas sería ${coma(r.playa.factorViento ?? 1)}). Las ráfagas se corrigen igual.`;
  }
  if ((r.playa.factorViento ?? 1) !== 1) return `Viento en tu zona = viento del modelo × ${coma(r.playa.factorViento)} (del catálogo).`;
  return `El viento y las ráfagas son del modelo, de una celda a varios km. Registra cómo estaba el viento en 3 salidas para corregirlos: llevas ${salidasPlaya}.`;
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

// campo: 'olas' | 'viento'. Cada uno se guarda junto a lo que decía el modelo ese día (lo que se quiere aprender).
function registrar(playa, indice, campo, valor) {
  const fecha = fechaDelDia(0);
  const { config } = estado;
  const horas = estado.mar[indice] ?? [];
  const cambios = campo === 'olas'
    ? { impresion: valor, hsBase: hsBaseDelDia(horas, fecha, config.ventana, playa.orientacion, config.umbrales) }
    : { viento: valor, vientoBase: vientoBaseDelDia(horas, fecha, config.ventana) };
  estado.salidas = agregarSalida(estado.salidas, nuevaSalida({ playaId: playa.id, fecha, ...cambios }));
  estado.mensajeSalidas = guardarSalidas(almacen(), estado.salidas)
    ? ''
    : 'No pude guardar en este navegador (¿modo privado?). Exporta tus salidas para no perderlas.';
  estado.abiertas.add(playa.id);
  pintar();
}

function filaRegistro(r, ya, campo, titulo, opciones, actual) {
  const botones = Object.entries(opciones).map(([clave, { etiqueta }]) => {
    const b = el('button', { type: 'button', text: etiqueta, 'aria-pressed': String(actual === clave) });
    b.addEventListener('click', () => registrar(r.playa, r.indice, campo, clave));
    return b;
  });
  return el('div', { class: 'fila-registro' },
    el('p', { text: actual ? `${titulo}: ${opciones[actual].etiqueta}. Puedes cambiarlo:` : titulo }),
    botones);
}

function bloqueRegistro(r) {
  if (estado.dia !== 0) return null;
  const hoy = fechaDelDia(0);
  const ya = estado.salidas.find((s) => s.playaId === r.playa.id && s.fecha === hoy);
  return el('div', { class: 'registro' },
    filaRegistro(r, ya, 'olas', '¿Cómo estaba el mar hoy en tu zona de remo?', IMPRESIONES, ya?.impresion),
    filaRegistro(r, ya, 'viento', '¿Y el viento?', IMPRESIONES_VIENTO, ya?.viento));
}

// Avisos de la ficha de una playa: ola sin ajustar y ubicación u orientación sin confirmar.
function avisosFicha(r) {
  const sinCalibrar = r.playa.factorOla === undefined && !r.aprendido;
  if (!sinCalibrar && r.playa.verificada) return null;
  return el('p', { class: 'ficha-avisos' },
    sinCalibrar ? el('span', { class: 'sin-calibrar', text: 'Sin calibrar' }) : null,
    r.playa.verificada ? null : el('small', { class: 'gris', text: 'Ubicación y orientación sin verificar por remeros de la zona' }));
}

function tarjeta(r, oleaje) {
  if (r.estado === 'sin-mar') {
    return el('article', { class: 'playa sin-datos' }, el('h3', { text: r.playa.nombre }), el('p', { text: 'No pude obtener el mar ahora. Reintenta más tarde.' }));
  }
  const cabecera = el('div', { class: 'cabecera' },
    el('span', { class: 'nombre', text: r.playa.nombre }, nivelDePlaya(r.playa, oleaje)),
    chipDePlaya(r));
  const resumen = el('summary', { text: 'Detalle por hora y registro' });
  const horasTabla = r.horas.length ? r.horas : r.horasDia;
  const filas = horasTabla.map((h) => el('tr', { class: h.color },
    el('td', { text: `${String(Number(h.hora.slice(11, 13)))} h` }),
    el('td', {},
      h.dato.hs === null ? '—' : `${num1(h.dato.hs)} m`,
      h.dato.hsModelo ? el('small', { class: 'gris', text: ` (modelo ${num1(h.dato.hsModelo)})` }) : null),
    el('td', { text: h.dato.tp === null ? '—' : `${num1(h.dato.tp)} s` }),
    el('td', {},
      h.dato.vientoKmh === null ? '—' : `${Math.round(h.dato.vientoKmh)} km/h`,
      h.dato.vientoModelo !== undefined ? el('small', { class: 'gris', text: ` (modelo ${Math.round(h.dato.vientoModelo)})` }) : null,
      typeof h.dato.rafagaKmh === 'number' ? el('small', { class: 'gris', text: ` ráf. ${Math.round(h.dato.rafagaKmh)}${h.dato.rafagaModelo !== undefined ? ` (${Math.round(h.dato.rafagaModelo)})` : ''}` }) : null),
    el('td', { text: `${SIMBOLO[h.color]} ${motivoHora(h) || 'Verde'}` })));
  const detalles = el('details', estado.abiertas.has(r.playa.id) ? { open: '' } : {}, resumen,
    el('p', { class: 'motivo', text: r.motivo }),
    el('p', { class: 'nota gris', text: notaFactor(r) }),
    el('p', { class: 'nota gris', text: notaViento(r) }),
    notaExposicion(r),
    ...r.notas.map((n) => el('p', { class: 'nota', text: n })),
    lineaMareas(r),
    horasTabla.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Hora', 'Ola', 'Periodo', 'Viento', 'Estado / motivo'].map((t) => el('th', { text: t })))), el('tbody', {}, filas)) : null,
    bloqueRegistro(r));
  detalles.addEventListener('toggle', () => {
    if (detalles.open) estado.abiertas.add(r.playa.id);
    else estado.abiertas.delete(r.playa.id);
  });
  return el('article', { class: 'playa' }, cabecera, avisosFicha(r), panelGrafico(r), detalles);
}

const pct = (v, max) => `${Math.max(6, Math.min(100, Math.round((v / max) * 100)))}%`;
const colorViento = (kmh, u) => (kmh <= u.viento.verde ? 'verde' : kmh <= u.viento.amarillo ? 'amarillo' : 'rojo');

// Clima de la playa (no entra en el semáforo): horas de sol directo y temperatura del aire en la ventana de remo.
function climaDelDia(horasDia) {
  const hs = horasDia.filter((h) => typeof h.dato.solSeg === 'number' && typeof h.dato.tempAire === 'number');
  if (!hs.length) return null;
  const horasSol = hs.reduce((s, h) => s + h.dato.solSeg, 0) / 3600;
  const fraccion = horasSol / hs.length;
  const temps = hs.map((h) => h.dato.tempAire);
  const [etiqueta, color] = fraccion >= 0.7 ? ['soleado', 'sol'] : fraccion >= 0.3 ? ['sol y nubes', 'amarillo'] : ['nublado', 'neutro'];
  return { horasSol, etiqueta, color, min: Math.min(...temps), max: Math.max(...temps) };
}

// Lo esencial de la playa de un vistazo: tres cifras y la evolución hora a hora (semáforo, olas y viento).
function panelGrafico(r) {
  const { config } = estado;
  const u = config.umbrales;
  // Cuando ya pasó la ventana de remo no quedan horas por evaluar: se muestran las condiciones de todo el día.
  const terminado = r.horas.length === 0 && r.horasDia.length > 0;
  const base = terminado ? r.horasDia : r.horas;
  const datos = base.filter((h) => typeof h.dato.hs === 'number');
  if (!datos.length) return null;
  const hsMedia = datos.reduce((s, h) => s + h.dato.hs, 0) / datos.length;
  const vientoMax = Math.max(...base.map((h) => h.dato.vientoKmh ?? 0));
  const rafagaMax = Math.max(...base.map((h) => h.dato.rafagaKmh ?? h.dato.vientoKmh ?? 0));
  const grado = gradoMar(hsMedia, u);
  const cifra = (valor, unidad, etiqueta, color) => el('div', { class: `cifra ${color}` },
    el('span', { class: 'valor' }, valor, el('small', { text: ` ${unidad}` })),
    el('span', { class: 'etiqueta', text: etiqueta }));
  const cifras = el('div', { class: 'cifras' },
    cifra(num1(hsMedia), 'm', `Ola · ${ETIQUETA_GRADO[grado].replace('Mar ', '').toLowerCase()}`, COLOR_GRADO[grado]),
    cifra(String(Math.round(vientoMax)), 'km/h', 'Viento máx.', colorViento(vientoMax, u)),
    cifra(String(Math.round(rafagaMax)), 'km/h', 'Ráfaga máx.', colorRafaga(rafagaMax, u).color));
  const clima = climaDelDia(r.horasDia);
  const cifrasClima = clima && el('div', { class: 'cifras clima' },
    cifra(String(Math.round(clima.horasSol * 10) / 10).replace('.', ','), 'h', `Sol directo · ${clima.etiqueta}`, clima.color),
    cifra(`${Math.round(clima.min)}–${Math.round(clima.max)}`, '°C', 'Aire (mín–máx)', 'neutro'));

  const ahoraH = ahoraLima(estado.ahoraMs).slice(0, 13);
  const porHora = new Map(r.horasDia.map((h) => [Number(h.hora.slice(11, 13)), h]));
  const horas = [];
  for (let h = config.ventana.horaInicio; h < config.ventana.horaFin; h += 1) horas.push(h);
  const fila = (titulo, celda) => el('div', { class: 'fila-graf' },
    el('span', { class: 'rotulo', text: titulo }),
    el('div', { class: 'columnas' }, horas.map((h) => celda(h, porHora.get(h)))));
  const pasada = (d) => (estado.dia === 0 && !terminado && d && d.hora.slice(0, 13) < ahoraH ? ' pasada' : '');
  const semaforo = fila('Apto', (h, d) => el('span', { class: `celda ${d ? d.color : 'gris'}${pasada(d)}`, title: d ? motivoHora(d) || 'Verde' : 'Sin datos' }));
  const olas = fila('Ola (m)', (h, d) => el('span', { class: 'col' },
    d && typeof d.dato.hs === 'number'
      ? el('span', { class: `barra ${COLOR_GRADO[gradoMar(d.dato.hs, u)]}${pasada(d)}`, alto: pct(d.dato.hs, 2), title: `${num1(d.dato.hs)} m` })
      : null));
  const viento = fila('Viento', (h, d) => {
    const kmh = d ? (d.dato.rafagaKmh ?? d.dato.vientoKmh) : null;
    return el('span', { class: 'col' },
      typeof kmh === 'number'
        ? el('span', { class: `barra ${colorRafaga(kmh, u).color}${pasada(d)}`, alto: pct(kmh, 50), title: `Ráfaga ${Math.round(kmh)} km/h` })
        : null);
  });
  const sol = fila('Sol', (h, d) => el('span', { class: 'col' },
    d && typeof d.dato.solSeg === 'number'
      ? el('span', { class: `barra sol${pasada(d)}`, alto: pct(d.dato.solSeg, 3600), title: `${Math.round(d.dato.solSeg / 60)} min de sol${typeof d.dato.nubes === 'number' ? ` · nubes ${Math.round(d.dato.nubes)} %` : ''}${typeof d.dato.tempAire === 'number' ? ` · ${num1(d.dato.tempAire)} °C` : ''}` })
      : null));
  const horasEtiqueta = el('div', { class: 'fila-graf' },
    el('span', { class: 'rotulo' }),
    el('div', { class: 'columnas horas' }, horas.map((h) => el('span', { text: h % 2 === 0 ? String(h) : '' }))));
  const leyenda = terminado ? el('p', { class: 'gris pequeno', text: 'La ventana de remo de hoy ya terminó: así estuvo el mar durante el día.' })
    : estado.dia === 0 ? el('p', { class: 'gris pequeno', text: 'Las horas ya pasadas aparecen atenuadas.' }) : null;
  return el('div', { class: 'grafico' }, cifras, cifrasClima, semaforo, olas, viento, clima ? sol : null, horasEtiqueta, leyenda);
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

// ---------- Grifos: precio del combustible (Osinergmin, el registro que alimenta Facilito) ----------
const soles = (n) => `S/ ${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')}`;
const titulo = (t) => t.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const nombreGrifo = (g) => g.nombre ?? titulo(g.razon);
// El registro no trae coordenadas: se navega por dirección (hasta la primera coma, sin referencias) + distrito.
function destinoGrifo(g) {
  const calle = g.direccion.split(',')[0].replace(/\s+/g, ' ').trim();
  return `${calle}, ${titulo(g.distrito)}, Lima, Perú`;
}
const enlaceMaps = (g) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinoGrifo(g))}`;
const enlaceWaze = (g) => `https://waze.com/ul?q=${encodeURIComponent(destinoGrifo(g))}&navigate=yes`;
const fechaPrecio = (g) => (g.dias === 0 ? 'precio de hoy' : g.dias === 1 ? 'precio de ayer' : `precio de hace ${g.dias} días`);

function filaGrifo(g, referencia) {
  if (g.sinPrecio) {
    return el('li', { class: 'grifo' }, el('div', { class: 'datos' }, el('strong', { text: nombreGrifo(g) }), el('small', { class: 'gris', text: 'Sin precio vigente en el registro' })));
  }
  const dif = referencia === null ? null : Math.round((g.precio - referencia) * 100) / 100;
  const etiqueta = dif === null ? null : dif <= 0.005 ? 'el más barato' : `+${soles(dif)}`;
  const tono = dif === null ? 'gris' : dif <= 0.005 ? 'verde' : dif <= 0.5 ? 'amarillo' : 'rojo';
  return el('li', { class: 'grifo' },
    el('div', { class: 'datos' },
      el('strong', { text: nombreGrifo(g) }),
      el('small', { class: 'gris', text: [g.nombre ? titulo(g.razon) : null, titulo(g.distrito), titulo(g.direccion)].filter(Boolean).join(' · ') }),
      el('small', { class: g.dias > 7 ? 'nota' : 'gris', text: fechaPrecio(g) })),
    el('div', { class: 'lado' },
      el('div', { class: 'precio' }, el('span', { class: 'monto', text: soles(g.precio) }), etiqueta ? el('span', { class: `chip ${tono}`, text: etiqueta }) : null),
      el('div', { class: 'ir' },
        el('a', { href: enlaceWaze(g), target: '_blank', rel: 'noopener noreferrer', class: 'boton-ir waze', 'aria-label': `Ir a ${nombreGrifo(g)} con Waze`, text: 'Waze' }),
        el('a', { href: enlaceMaps(g), target: '_blank', rel: 'noopener noreferrer', class: 'boton-ir', 'aria-label': `Ir a ${nombreGrifo(g)} con Google Maps`, text: 'Maps' }))));
}

function seccionGrifos() {
  const { grifos } = estado;
  if (!grifos || !conGrifos(estado.config.playas)) return null;
  const candidatos = [...grifos.favoritos.filter((g) => !g.sinPrecio), ...grifos.zonas.flatMap((z) => z.grifos)];
  const referencia = candidatos.length ? Math.min(...candidatos.map((g) => g.precio)) : null;
  const generado = Date.parse(grifos.generadoEn);
  // Plegable: cerrado de entrada; se recuerda si lo abriste mientras la página siga abierta (pintar() rehace todo).
  const cabecera = el('summary', {},
    el('span', { class: 'grifos-cabecera' },
      el('h2', { text: `Combustible · ${grifos.producto}` }),
      referencia !== null ? el('span', { class: 'grifos-desde', text: `Desde ${soles(referencia)}` }) : null));
  const plegable = el('details', estado.grifosAbierto ? { open: '' } : {}, cabecera,
    referencia !== null ? el('p', { class: 'resumen', text: `El más barato de estas opciones: ${soles(referencia)} por ${grifos.unidad}. Mediana en Lima: ${soles(grifos.medianaLima)}.` }) : null,
    el('h3', { text: 'Grifos destacados' }),
    el('ul', {}, grifos.favoritos.map((g) => filaGrifo(g, referencia))),
    el('h3', { text: 'Más baratos en las rutas al mar de Lima' }),
    grifos.zonas.map((z) => el('div', { class: 'zona' },
      el('p', { class: 'zona-nombre', text: z.nombre }),
      z.grifos.length ? el('ul', {}, z.grifos.map((g) => filaGrifo(g, referencia))) : el('p', { class: 'gris pequeno', text: 'Sin precios recientes en este tramo.' }))),
    el('h3', { text: 'Los más baratos de Lima' }),
    el('ul', {}, grifos.lima.map((g) => filaGrifo(g, referencia))),
    el('p', { class: 'gris pequeno', text: `Precio por ${grifos.unidad}, declarado por cada grifo a Osinergmin (la fuente de Facilito). Mira el cartel del surtidor antes de cargar. Leído el ${fechaCorta(generado)} ${horaCorta(generado)}.` }),
    el('p', { class: 'gris pequeno' }, el('a', { href: 'https://www.facilito.gob.pe/facilito/', text: 'Abrir Facilito', rel: 'noopener' })));
  plegable.addEventListener('toggle', () => { estado.grifosAbierto = plegable.open; });
  return el('section', { class: 'grifos' }, plegable);
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
  const minutos = Math.max(0, Math.round((Date.now() - marMs) / 60_000));
  lineas.push(el('p', { class: 'gris', text: `Datos del DHN leídos: ${dhn ? `${fechaCorta(Date.parse(dhn.generadoEn))} ${horaCorta(Date.parse(dhn.generadoEn))}` : 'no disponible'}${estado.config.playas.length ? ` · Mar consultado: ${horaCorta(marMs)}${minutos >= 1 ? ` (hace ${minutos} min)` : ''}` : ''}` }));
  lineas.push(el('p', { class: 'gris pequeno', text: estado.catalogo.fuente }));  lineas.push(el('p', { class: 'gris', text: 'Oleaje, viento, ráfagas y mareas son de modelo (Open-Meteo), no medidos en la orilla; varias playas pueden compartir la misma celda del modelo. Es una ayuda para decidir, no un permiso: manda lo que veas en la orilla y cualquier cierre de puerto. Antes de salir revisa dhn.mil.pe o la app MGP Tsunamis.' }));
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

// Service worker: abrir al instante y sin conexión (ver sw.js). Si el navegador no lo admite, no pasa nada.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Cambio de tema desde el botón de la cabecera (tema.js): solo se vuelve a pintar.
document.addEventListener('cambio-tema', () => { if (estado.config) pintar(); });

// Al volver a la pestaña tras 3 h o más se pide de nuevo (el servidor decide si hace falta).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && estado.config && Date.now() - estado.ultimoRefresco >= 3 * 3600_000) refrescar();
});

// Si la pestaña queda abierta de un día para otro, "Hoy" se recarga solo con los datos del nuevo día.
setInterval(() => {
  if (estado.diaCargado && ahoraLima(Date.now()).slice(0, 10) !== estado.diaCargado) {
    estado.dia = 0;
    iniciar().catch(mostrarError);
  }
}, 60_000);
