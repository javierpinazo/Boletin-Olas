// "Mis playas": los ids que el remero eligió, guardados en el navegador.
export const MAX_PLAYAS = 6;
export const CLAVE_MIS_PLAYAS = 'boletin-olas:mis-playas:v1';
export const ORIGINALES = ['yuyos', 'la-punta', 'punta-hermosa', 'san-bartolo'];

const CLAVE_SALIDAS = 'boletin-olas:salidas:v1';
const PREFIJO_CACHE = 'cache:v1:';

// Quien ya usaba la app (tiene salidas o datos guardados) no debe perder sus playas.
function yaUsabaLaApp(storage) {
  if (storage.getItem(CLAVE_SALIDAS) !== null) return true;
  for (let i = 0; i < storage.length; i += 1) {
    if (storage.key(i)?.startsWith(PREFIJO_CACHE)) return true;
  }
  return false;
}

export function guardarMisPlayas(storage, lista) {
  try {
    if (!storage) return false;
    storage.setItem(CLAVE_MIS_PLAYAS, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

// Llamar ANTES de que la app guarde nada en caché. El resultado se guarda de inmediato (también la lista
// vacía): así un usuario nuevo no pasa por "usuario actual" en su segunda visita.
export function iniciarMisPlayas(storage, idsCatalogo) {
  let lista = [];
  try {
    const crudo = storage?.getItem(CLAVE_MIS_PLAYAS) ?? null;
    if (crudo !== null) {
      const datos = JSON.parse(crudo);
      if (Array.isArray(datos)) lista = [...new Set(datos)].filter((id) => idsCatalogo.includes(id)).slice(0, MAX_PLAYAS);
    } else if (storage && yaUsabaLaApp(storage)) {
      lista = ORIGINALES.filter((id) => idsCatalogo.includes(id));
    }
  } catch {
    lista = [];
  }
  guardarMisPlayas(storage, lista);
  return lista;
}

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
