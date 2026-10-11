// Registro de salidas: "así estaba el mar y el viento hoy" en cada playa. Con 3 o más, la app aprende los
// factores de ola y de viento de esa playa (cuánto de lo que dice el modelo llega a la zona donde remas).
// Se guarda en el navegador.
import { factorExposicion } from './score.js';

// Altura aproximada que representa cada impresión (lo que el usuario ve en su zona de remo).
export const IMPRESIONES = {
  plano: { etiqueta: 'Plano', metros: 0.1 },
  olitas: { etiqueta: 'Olitas', metros: 0.3 },
  conOlas: { etiqueta: 'Con olas', metros: 0.6 },
  noSePodia: { etiqueta: 'No se podía remar', metros: 1.0 },
};

// Viento sostenido aproximado que representa cada impresión.
export const IMPRESIONES_VIENTO = {
  calmo: { etiqueta: 'Calmo', kmh: 5 },
  moderado: { etiqueta: 'Moderado', kmh: 15 },
  fuerte: { etiqueta: 'Fuerte', kmh: 25 },
  muyFuerte: { etiqueta: 'Muy fuerte', kmh: 35 },
};

const CLAVE = 'boletin-olas:salidas:v1';
const MINIMO_SALIDAS = 3;
const FACTOR_OLA = { min: 0.05, max: 1.5 };
const FACTOR_VIENTO = { min: 0.2, max: 1.5 };

// hsBase: ola media del modelo ese día en la ventana, ya corregida por la orientación de la playa y SIN el
// factor de ola. vientoBase: viento medio del modelo ese día en la ventana, SIN factor. Son justo lo que se
// quiere aprender. Se puede registrar solo las olas, solo el viento o ambos.
export function nuevaSalida({ playaId, fecha, impresion, hsBase, viento, vientoBase }) {
  if (impresion === undefined && viento === undefined) throw new Error('Falta la impresión (olas o viento)');
  if (impresion !== undefined && !(impresion in IMPRESIONES)) throw new Error(`Impresión desconocida: ${impresion}`);
  if (viento !== undefined && !(viento in IMPRESIONES_VIENTO)) throw new Error(`Impresión de viento desconocida: ${viento}`);
  return {
    id: `${fecha}-${playaId}`,
    playaId,
    fecha,
    ...(impresion !== undefined ? { impresion, hsBase } : {}),
    ...(viento !== undefined ? { viento, vientoBase } : {}),
  };
}

// Un registro por playa y día: si ya había uno, los campos nuevos se suman y los repetidos se reemplazan.
export function agregarSalida(lista, salida) {
  const previa = lista.find((s) => s.id === salida.id);
  return [...lista.filter((s) => s.id !== salida.id), { ...previa, ...salida }].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function factorDeMediana(cocientes, { min, max }) {
  if (cocientes.length < MINIMO_SALIDAS) return null;
  const factor = Math.min(max, Math.max(min, mediana(cocientes)));
  return { factor: Math.round(factor * 100) / 100, n: cocientes.length };
}

// { factor, n } con la mediana de (altura percibida / altura base) de la playa, o null si hay pocas salidas.
export function factorAprendido(lista, playaId) {
  return factorDeMediana(
    lista
      .filter((s) => s.playaId === playaId && s.impresion in IMPRESIONES && typeof s.hsBase === 'number' && s.hsBase > 0)
      .map((s) => IMPRESIONES[s.impresion].metros / s.hsBase),
    FACTOR_OLA,
  );
}

// Igual para el viento: (km/h percibidos / km/h del modelo).
export function factorVientoAprendido(lista, playaId) {
  return factorDeMediana(
    lista
      .filter((s) => s.playaId === playaId && s.viento in IMPRESIONES_VIENTO && typeof s.vientoBase === 'number' && s.vientoBase > 0)
      .map((s) => IMPRESIONES_VIENTO[s.viento].kmh / s.vientoBase),
    FACTOR_VIENTO,
  );
}

const numeroOAusente = (x) => x === undefined || x === null || typeof x === 'number';

const esSalida = (s) => s !== null && typeof s === 'object'
  && typeof s.id === 'string' && typeof s.playaId === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(s.fecha ?? '')
  && (s.impresion in IMPRESIONES || s.viento in IMPRESIONES_VIENTO)
  && (s.impresion === undefined || s.impresion in IMPRESIONES)
  && (s.viento === undefined || s.viento in IMPRESIONES_VIENTO)
  && numeroOAusente(s.hsBase) && numeroOAusente(s.vientoBase);

// Importar un JSON exportado: se suman las salidas válidas y, si coincide el día y la playa, gana la importada.
export function fusionar(actual, importadas) {
  if (!Array.isArray(importadas)) throw new Error('El archivo no es una lista de salidas');
  return importadas.filter(esSalida).reduce(agregarSalida, actual);
}

const enVentana = (h, fecha, ventana) => {
  if (!h.hora.startsWith(fecha)) return false;
  const n = Number(h.hora.slice(11, 13));
  return n >= ventana.horaInicio && n < ventana.horaFin;
};

const media1 = (valores) => (valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100);

export function hsBaseDelDia(horas, fecha, ventana, orientacion, u) {
  return media1(
    horas
      .filter((h) => enVentana(h, fecha, ventana) && typeof h.hs === 'number')
      .map((h) => h.hs * factorExposicion(h.dirOla, orientacion, u)),
  );
}

export function vientoBaseDelDia(horas, fecha, ventana) {
  return media1(horas.filter((h) => enVentana(h, fecha, ventana) && typeof h.vientoKmh === 'number').map((h) => h.vientoKmh));
}

// El almacenamiento del navegador puede no existir o estar bloqueado (modo privado): nunca rompe la página.
export function leerSalidas(storage) {
  try {
    const datos = JSON.parse(storage?.getItem(CLAVE) ?? '[]');
    return Array.isArray(datos) ? datos.filter(esSalida) : [];
  } catch {
    return [];
  }
}

export function guardarSalidas(storage, lista) {
  try {
    storage.setItem(CLAVE, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}
