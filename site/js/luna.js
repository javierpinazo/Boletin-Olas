// Fase de la Luna calculada localmente (sin servicios externos). Usa el mes sinódico medio desde una luna nueva
// conocida: el error es de unas horas, de sobra para saber en qué fase estamos y si vienen mareas vivas o muertas.
const SINODICO = 29.530588853; // días
const LUNA_NUEVA_REF = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const DIA = 864e5;

export const NOMBRES = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];

// Posición en el ciclo: 0 = nueva, 0,25 = cuarto creciente, 0,5 = llena, 0,75 = cuarto menguante.
export const posicionCiclo = (ms) => {
  const p = ((ms - LUNA_NUEVA_REF) / DIA / SINODICO) % 1;
  return p < 0 ? p + 1 : p;
};

// Una de las 8 fases (0 = nueva … 4 = llena … 7 = menguante): la más cercana a la posición.
export const indiceFase = (p) => Math.round(p * 8) % 8;

export const iluminacion = (p) => (1 - Math.cos(2 * Math.PI * p)) / 2;

// Días hasta la sizigia (nueva/llena) o la cuadratura (cuartos) más cercana, para decir el tipo de marea.
export function tipoMarea(p) {
  const aCuarto = (x) => Math.abs(((x * 4 + 0.5) % 1) - 0.5) * SINODICO / 4; // días al múltiplo de 1/4 más cercano
  const k = Math.round(p * 4) % 4; // 0 y 2 = nueva/llena; 1 y 3 = cuartos
  const dias = aCuarto(p);
  if (dias > 2.5) return { tipo: 'intermedia', texto: 'Mareas intermedias' };
  return k % 2 === 0
    ? { tipo: 'viva', texto: 'Mareas vivas: mayor diferencia entre pleamar y bajamar' }
    : { tipo: 'muerta', texto: 'Mareas muertas: poca diferencia entre pleamar y bajamar' };
}

// Próxima luna nueva y próxima luna llena a partir de ms.
export function proximas(ms) {
  const p = posicionCiclo(ms);
  const hasta = (objetivo) => {
    let d = (objetivo - p) * SINODICO;
    if (d <= 0) d += SINODICO;
    return ms + d * DIA;
  };
  return { nueva: hasta(0), llena: hasta(0.5) };
}

// Trazo SVG de la parte iluminada de un disco de radio r centrado en (0,0), tal como se ve desde el hemisferio sur:
// la luna creciente se ilumina por la izquierda y la menguante por la derecha.
export function trazoLuz(p, r) {
  const crecien = p < 0.5;
  const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
  const creciente = Math.cos(2 * Math.PI * p) > 0; // luz fina (cuarto o menos), terminador del lado iluminado
  const barrido = crecien ? 0 : 1; // izquierda = 0, derecha = 1
  const retorno = creciente ? 1 - barrido : barrido;
  const r2 = (n) => Math.round(n * 100) / 100;
  return `M0,${-r} A${r},${r} 0 0 ${barrido} 0,${r} A${r2(rx)},${r} 0 0 ${retorno} 0,${-r} Z`;
}
