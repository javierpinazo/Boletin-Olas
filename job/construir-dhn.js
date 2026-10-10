import { separarItems } from './html.js';
import { parseAviso, AvisoNoEntendido, numeroDeTitulo } from './parse-aviso.js';
import { parseTsunami, BoletinNoEntendido } from './parse-tsunami.js';
import { LUGARES } from '../site/js/lugares.js';

const VENTANA_TSUNAMI_MS = 72 * 3600 * 1000;
const MAX_TSUNAMI = 10;

const numeroAviso = (titulo) => numeroDeTitulo(titulo)?.orden ?? -1; // año*1000 + número

// htmlAvisos / htmlTsunami: HTML de las páginas del portal. previo: dhn.json anterior o null.
export function construirDhn({ htmlAvisos, htmlTsunami, previo = null, ahora }) {
  const oleaje = separarItems(htmlAvisos)
    .filter((i) => /AVISO ESPECIAL DE OLEAJE/i.test(i.titulo))
    .sort((a, b) => numeroAviso(b.titulo) - numeroAviso(a.titulo));
  if (oleaje.length === 0) throw new Error('La página de avisos no trae ningún aviso de oleaje');

  let aviso = null;
  let avisoCrudo = null;
  let parseError = false;
  try {
    aviso = parseAviso(oleaje[0]);
    for (const tramo of aviso.tramos) {
      for (const limite of [tramo.desde, tramo.hasta]) {
        if (!(limite in LUGARES)) throw new AvisoNoEntendido(`Límite de tramo desconocido: "${limite}"`);
      }
    }
  } catch (e) {
    if (!(e instanceof AvisoNoEntendido)) throw e;
    parseError = true;
    aviso = previo?.aviso ?? null; // último aviso que sí entendimos
    avisoCrudo = {
      titulo: oleaje[0].titulo,
      texto: oleaje[0].texto,
      url: oleaje[0].id
        ? `https://www.dhn.mil.pe/portal/avisos-especiales/${oleaje[0].id}`
        : 'https://www.dhn.mil.pe/portal/avisos-especiales',
      motivo: e.message,
    };
  }

  // Algunos boletines (p. ej. los de alerta) no traen "El día ... hora local": sin fechaLocal,
  // la vigencia se mide desde que el job los vio por primera vez. Ese registro (`vistos`) se
  // arrastra entre corridas sin podarse: si se perdiera al salir de la ventana, el boletín, que
  // sigue listado en el portal meses después, volvería a parecer nuevo. En la primera corrida
  // (sin previo) no se sabe cuándo apareció, así que queda con vistoEn null y no cuenta como reciente.
  const vistos = { ...(previo?.vistos ?? {}) };
  const anioActual = new Date(ahora.getTime() - 5 * 3600 * 1000).getUTCFullYear();
  const boletines = separarItems(htmlTsunami).filter((i) => /SISMO TSUNAMI/i.test(i.titulo));
  if (boletines.length === 0) throw new Error('La página de sismo/tsunami no trae ningún boletín');
  const tsunami = boletines
    .map((i) => {
      let b;
      try {
        b = parseTsunami(i);
      } catch (e) {
        if (!(e instanceof BoletinNoEntendido)) throw e;
        // Un boletín ilegible se trata como alerta.
        b = {
          numero: i.titulo, evento: null, version: 0, fechaLocal: null, lugar: null,
          magnitud: null, generaTsunamiEnPeru: true, textoCrudo: i.texto,
        };
      }
      if (!(b.numero in vistos)) vistos[b.numero] = previo ? ahora.toISOString() : null;
      return { ...b, vistoEn: vistos[b.numero] };
    })
    .filter((b) => {
      const anioEvento = Number(b.evento?.split('-')[1]);
      if (!b.fechaLocal && anioEvento && anioEvento !== anioActual) return false; // sin fecha y de otro año
      const referencia = b.fechaLocal ?? b.vistoEn;
      if (!referencia) return false;
      return ahora.getTime() - Date.parse(referencia) <= VENTANA_TSUNAMI_MS;
    })
    .slice(0, MAX_TSUNAMI);

  const dhn = { generadoEn: ahora.toISOString(), parseError, aviso, avisoCrudo, tsunami, vistos };
  validarDhn(dhn);
  return dhn;
}

export function validarDhn(d) {
  const falla = (m) => {
    throw new Error(`dhn.json inválido: ${m}`);
  };
  if (!d || typeof d !== 'object') falla('no es un objeto');
  if (Number.isNaN(Date.parse(d.generadoEn))) falla('generadoEn');
  if (typeof d.parseError !== 'boolean') falla('parseError');
  if (d.aviso) {
    if (!/^\d+-\d+$/.test(d.aviso.numero)) falla('aviso.numero');
    if (!Array.isArray(d.aviso.tramos) || d.aviso.tramos.length === 0) falla('aviso.tramos');
    for (const t of d.aviso.tramos) {
      if (!t.desde || !t.hasta || typeof t.desdeExclusivo !== 'boolean') falla(`tramo ${t.nombre}`);
      if (!Array.isArray(t.linea) || t.linea.length === 0) falla(`linea de ${t.nombre}`);
      for (const p of t.linea) {
        if (!['normal', 'ligero', 'moderado', 'fuerte', 'muy fuerte'].includes(p.nivel)) falla(`nivel ${p.nivel}`);
        if (Number.isNaN(Date.parse(p.desde))) falla(`desde ${p.desde}`);
      }
    }
  } else if (!d.parseError) {
    falla('sin aviso y sin parseError');
  }
  if (!Array.isArray(d.tsunami)) falla('tsunami');
  if (!d.vistos || typeof d.vistos !== 'object') falla('vistos');
}
