// "Mis playas": los ids que el remero eligió, guardados en el navegador.
export const MAX_PLAYAS = 6;
export const CLAVE_MIS_PLAYAS = 'boletin-olas:mis-playas:v1';
// Las 4 de Lima y Callao: lo que ve quien todavía no eligió las suyas.
export const ORIGINALES = ['yuyos', 'la-punta', 'punta-hermosa', 'san-bartolo'];

export function guardarMisPlayas(storage, lista) {
  try {
    if (!storage) return false;
    storage.setItem(CLAVE_MIS_PLAYAS, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

// Lo que el remero eligió ([] si todavía nada). Solo lee: mientras no elija, no se guarda nada.
export function leerMisPlayas(storage, idsCatalogo) {
  try {
    const datos = JSON.parse(storage?.getItem(CLAVE_MIS_PLAYAS) ?? '[]');
    return Array.isArray(datos) ? [...new Set(datos)].filter((id) => idsCatalogo.includes(id)).slice(0, MAX_PLAYAS) : [];
  } catch {
    return [];
  }
}

export const playasAVer = (elegidas) => (elegidas.length ? elegidas : ORIGINALES);

export const agregar = (lista, id) => (lista.includes(id) || lista.length >= MAX_PLAYAS ? lista : [...lista, id]);
export const quitar = (lista, id) => lista.filter((x) => x !== id);

export function mover(lista, id, paso) {
  const i = lista.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
