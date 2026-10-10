// Registro de salidas: "así estaba el mar hoy" en cada playa. Con 3 o más, la app aprende el factor de ola
// de esa playa (cuánto de la ola del modelo llega a la zona donde remas). Se guarda en el navegador.
import { factorExposicion } from './score.js';

// Altura aproximada que representa cada impresión (lo que el usuario ve en su zona de remo).
export const IMPRESIONES = {
  plano: { etiqueta: 'Plano', metros: 0.1 },
  olitas: { etiqueta: 'Olitas', metros: 0.3 },
  conOlas: { etiqueta: 'Con olas', metros: 0.6 },
  noSePodia: { etiqueta: 'No se podía remar', metros: 1.0 },
};

const CLAVE = 'boletin-olas:salidas:v1';
const MINIMO_SALIDAS = 3;
const FACTOR_MIN = 0.05;
const FACTOR_MAX = 1.5;

// hsBase: ola media del modelo ese día en la ventana, ya corregida por la orientación de la playa y
// SIN el factor de ola (que es justo lo que se quiere aprender).
export function nuevaSalida({ playaId, fecha, impresion, hsBase }) {
  if (!(impresion in IMPRESIONES)) throw new Error(`Impresión desconocida: ${impresion}`);
  return { id: `${fecha}-${playaId}`, playaId, fecha, impresion, hsBase };
}

export function agregarSalida(lista, salida) {
  return [...lista.filter((s) => s.id !== salida.id), salida].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// { factor, n } con la mediana de (altura percibida / altura base) de la playa, o null si hay pocas salidas.
export function factorAprendido(lista, playaId) {
  const cocientes = lista
    .filter((s) => s.playaId === playaId && typeof s.hsBase === 'number' && s.hsBase > 0)
    .map((s) => IMPRESIONES[s.impresion].metros / s.hsBase);
  if (cocientes.length < MINIMO_SALIDAS) return null;
  const factor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, mediana(cocientes)));
  return { factor: Math.round(factor * 100) / 100, n: cocientes.length };
}

const esSalida = (s) => s !== null && typeof s === 'object'
  && typeof s.id === 'string' && typeof s.playaId === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(s.fecha ?? '') && s.impresion in IMPRESIONES
  && (s.hsBase === null || typeof s.hsBase === 'number');

// Importar un JSON exportado: se suman las salidas válidas y, si coincide el día y la playa, gana la importada.
export function fusionar(actual, importadas) {
  if (!Array.isArray(importadas)) throw new Error('El archivo no es una lista de salidas');
  return importadas.filter(esSalida).reduce(agregarSalida, actual);
}

export function hsBaseDelDia(horas, fecha, ventana, orientacion, u) {
  const valores = horas
    .filter((h) => h.hora.startsWith(fecha))
    .filter((h) => {
      const n = Number(h.hora.slice(11, 13));
      return n >= ventana.horaInicio && n < ventana.horaFin;
    })
    .filter((h) => typeof h.hs === 'number')
    .map((h) => h.hs * factorExposicion(h.dirOla, orientacion, u));
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
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
