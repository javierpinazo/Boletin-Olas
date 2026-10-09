// Fechas en hora de Lima (UTC-5, sin horario de verano).

export const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const pad = (n) => String(n).padStart(2, '0');

export const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// 'YYYY-MM-DD' (fecha civil, sin zona).
export function fechaIso(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return fechaIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

export function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 'YYYY-MM-DDTHH:00:00-05:00'
export function instanteLima(iso, hora) {
  return `${iso}T${pad(hora)}:00:00-05:00`;
}
