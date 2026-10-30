// Cuándo conviene volver a leer el DHN cuando alguien abre la página.
// Regla: solo si el último dato tiene 3 horas o más (el primer acceso del día cae aquí porque el cron de las
// 6 a. m. ya dejó el dato del día; si no corrió, el dato tiene más de 3 h). Tras un fallo se espera antes de reintentar.
export const HORAS_MAX = 3;
export const ESPERA_TRAS_FALLO_MIN = 5;

export function decidir({ generadoEn, ahora, ultimoFallo = null }) {
  const edadMs = generadoEn ? ahora - Date.parse(generadoEn) : Infinity;
  if (edadMs < HORAS_MAX * 3600_000) return { actualizar: false, razon: 'reciente' };
  if (ultimoFallo !== null && ahora - ultimoFallo < ESPERA_TRAS_FALLO_MIN * 60_000) return { actualizar: false, razon: 'fallo-reciente' };
  return { actualizar: true, razon: generadoEn ? 'antiguo' : 'sin-datos' };
}
