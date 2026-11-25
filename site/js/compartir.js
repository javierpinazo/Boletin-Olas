// "Comparte el día": una imagen vertical (formato historia, 1080×1920) con lo esencial y casi sin texto,
// más un mensaje corto con los enlaces. Solo presentación: recibe el resumen ya calculado por app.js.
import { trazoLuz } from './luna.js';

export const COLOR_PUNTO = { verde: '#5fd394', amarillo: '#f2c14e', naranja: '#f2c14e', rojo: '#ff8a7a', gris: '#a9c2d6' };

// datos: {
//   fecha, titular ("Hoy se rema\ncon cuidado"), mejor ("Yuyos, 9–17 h" o null),
//   oleaje: { texto, color }, mar: { actual, dif } | null,
//   playas: [{ nombre, color, estado, ola, viento, rafaga }], luna: { nombre, p }, url, firma: { texto, url }
// }
// El mensaje no repite lo que ya muestra la imagen: el veredicto en una línea y los enlaces.
export function textoResumen(datos) {
  const veredicto = datos.titular.replace(/\n/g, ' ').toLowerCase();
  return [
    `Boletín Olas, ${datos.fecha}: ${veredicto}.${datos.mejor ? ` Mejor opción: ${datos.mejor}.` : ''}`,
    `Detalle hora a hora: ${datos.url}`,
    datos.firma?.texto ? [datos.firma.texto, datos.firma.url].filter(Boolean).join(' · ') : null,
  ].filter(Boolean).join('\n');
}

export const enlaceWhatsapp = (datos) => `https://wa.me/?text=${encodeURIComponent(textoResumen(datos))}`;

const ANCHO = 1080;
const ALTO = 1920;
const M = 80;
const UTIL = ANCHO - M * 2;
const TITULO = (t) => `700 ${t}px "Space Grotesk", "Segoe UI", system-ui, sans-serif`;
const CUERPO = (p) => (t) => `${p} ${t}px Inter, "Segoe UI", system-ui, sans-serif`;

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Escribe el texto achicando la letra hasta que quepa en `ancho`; devuelve el ancho final.
function texto(ctx, t, x, y, ancho, tamano, fuente, alinear = 'left') {
  let n = tamano;
  ctx.font = fuente(n);
  while (n > 18 && ctx.measureText(t).width > ancho) {
    n -= 2;
    ctx.font = fuente(n);
  }
  ctx.textAlign = alinear;
  ctx.fillText(t, x, y);
  ctx.textAlign = 'left';
  return ctx.measureText(t).width;
}

// Íconos de trazo (mismo dibujo que en la página) escalados a `t` px.
const ICONOS = {
  ola: 'M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  viento: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  rafaga: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
};
function icono(ctx, nombre, x, y, t, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(t / 24, t / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(ICONOS[nombre]));
  ctx.restore();
}

function luna(ctx, p, cx, cy, r) {
  ctx.fillStyle = '#2b3440';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#f3e9b8';
  ctx.fill(new Path2D(trazoLuz(p, r)));
  ctx.restore();
}

// Filas de playas entre y=940 y la luna: hasta 4 completas; con 5 o 6, compactas (nombre, color y horario).
export const disposicionPlayas = (n) => (n <= 4 ? { paso: 190, alto: 170, cifras: true } : { paso: 122, alto: 106, cifras: false });

export function dibujarTarjeta(canvas, datos) {
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Fondo: azul de la cabecera arriba, mar oscuro abajo, con una ola entre ambos.
  ctx.fillStyle = '#08131c';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = '#0e4f7a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ANCHO, 0);
  ctx.lineTo(ANCHO, 560);
  ctx.bezierCurveTo(880, 500, 700, 620, 520, 570);
  ctx.bezierCurveTo(340, 520, 160, 610, 0, 560);
  ctx.closePath();
  ctx.fill();

  // Fecha y veredicto.
  ctx.fillStyle = '#c6dcec';
  texto(ctx, datos.fecha.toUpperCase(), M, 150, UTIL, 40, CUERPO(600));
  ctx.fillStyle = '#ffffff';
  const lineas = datos.titular.split('\n');
  lineas.forEach((l, i) => texto(ctx, l, M, 280 + i * 118, UTIL, 112, TITULO));
  if (datos.mejor) {
    ctx.fillStyle = '#8fe0b4';
    texto(ctx, datos.mejor, M, 280 + lineas.length * 118 + 10, UTIL, 56, TITULO);
  }

  // Dos fichas: oleaje anómalo del DHN y temperatura del mar.
  const fy = 640;
  const fw = (UTIL - 30) / 2;
  const ficha = (x, rotulo, valor, colorValor, nota) => {
    ctx.fillStyle = '#12293b';
    redondeado(ctx, x, fy, fw, 250, 32);
    ctx.fill();
    ctx.fillStyle = '#a9c2d6';
    texto(ctx, rotulo, x + 36, fy + 64, fw - 72, 34, CUERPO(600));
    ctx.fillStyle = colorValor;
    texto(ctx, valor, x + 36, fy + 160, fw - 72, 84, TITULO);
    if (nota) {
      ctx.fillStyle = '#a9c2d6';
      texto(ctx, nota, x + 36, fy + 216, fw - 72, 32, CUERPO(500));
    }
  };
  ficha(M, 'Oleaje (DHN)', datos.oleaje.texto, COLOR_PUNTO[datos.oleaje.color] ?? '#e8f1f8', null);
  if (datos.mar) {
    ficha(M + fw + 30, 'Mar', `${datos.mar.actual} °C`, '#e8f1f8', datos.mar.dif ? `${datos.mar.dif} vs. habitual` : null);
  }

  // Playas: punto de color, nombre, horario y tres cifras con ícono.
  let y = 940;
  const fila = disposicionPlayas(datos.playas.length);
  const base = fila.cifras ? 74 : 69; // línea base del nombre dentro de la fila
  for (const p of datos.playas) {
    ctx.fillStyle = '#12293b';
    redondeado(ctx, M, y, UTIL, fila.alto, 32);
    ctx.fill();
    ctx.fillStyle = COLOR_PUNTO[p.color] ?? COLOR_PUNTO.gris;
    ctx.beginPath();
    ctx.arc(M + 48, y + base - 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR_PUNTO[p.color] ?? '#e8f1f8';
    const anchoEstado = texto(ctx, p.estado, ANCHO - M - 36, y + base, 300, 46, TITULO, 'right');
    ctx.fillStyle = '#e8f1f8';
    texto(ctx, p.nombre, M + 84, y + base, UTIL - 160 - anchoEstado, 48, CUERPO(700));
    if (fila.cifras && p.ola) {
      const cifras = [['ola', p.ola], ['viento', p.viento], ['rafaga', p.rafaga]];
      cifras.forEach(([ic, v], i) => {
        const x = M + 84 + i * 250;
        icono(ctx, ic, x, y + 106, 38, '#7cc4ff');
        ctx.fillStyle = '#c6dcec';
        texto(ctx, v, x + 50, y + 138, 190, 36, CUERPO(500));
      });
    }
    y += fila.paso;
  }

  // Luna y firma al pie.
  luna(ctx, datos.luna.p, M + 40, 1745, 40);
  ctx.fillStyle = '#e8f1f8';
  texto(ctx, datos.luna.nombre, M + 100, 1760, 420, 40, CUERPO(600));
  ctx.fillStyle = '#7cc4ff';
  texto(ctx, datos.url.replace(/^https?:\/\//, ''), ANCHO - M, 1760, 460, 34, CUERPO(600), 'right');
  ctx.fillStyle = '#1f4058';
  ctx.fillRect(M, 1810, UTIL, 2);
  if (datos.firma?.texto) {
    ctx.fillStyle = '#a9c2d6';
    texto(ctx, datos.firma.texto, ANCHO / 2, 1868, UTIL, 36, CUERPO(600), 'center');
  }
}
