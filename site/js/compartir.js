// "Comparte el día" (modo océano): una imagen resumen para el grupo de remo y su versión en texto.
// Solo presentación: recibe el resumen ya calculado por app.js.

export const COLOR_PUNTO = { verde: '#5fd394', amarillo: '#f2c14e', naranja: '#f2c14e', rojo: '#ff8a7a', gris: '#a9c2d6' };

// datos: { fecha, titular, oleaje, mar, playas: [{ nombre, color, texto, detalle }], pie, url }
export function textoResumen(datos) {
  return [
    `Boletín Olas · ${datos.fecha}`,
    datos.titular.replace(/\n/g, ' '),
    datos.oleaje,
    datos.mar,
    ...datos.playas.map((p) => `• ${p.nombre}: ${p.texto}${p.detalle ? ` · ${p.detalle}` : ''}`),
    datos.pie,
    datos.url,
  ].filter(Boolean).join('\n');
}

export const enlaceWhatsapp = (datos) => `https://wa.me/?text=${encodeURIComponent(textoResumen(datos))}`;

const ANCHO = 1080;
const ALTO = 1350;
const MARGEN = 80;

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Escribe el texto achicando la letra hasta que quepa en `ancho`.
function textoAjustado(ctx, texto, x, y, ancho, tamano, armarFuente) {
  let t = tamano;
  ctx.font = armarFuente(t);
  while (t > 20 && ctx.measureText(texto).width > ancho) {
    t -= 2;
    ctx.font = armarFuente(t);
  }
  ctx.fillText(texto, x, y);
}

// Dibuja la tarjeta 1080×1350 (formato vertical de redes) en el canvas dado.
export function dibujarTarjeta(canvas, datos) {
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  const titulo = (t) => `700 ${t}px "Space Grotesk", "Segoe UI", system-ui, sans-serif`;
  const cuerpo = (p) => (t) => `${p} ${t}px Inter, "Segoe UI", system-ui, sans-serif`;
  const util = ANCHO - MARGEN * 2;

  ctx.fillStyle = '#0e4f7a';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Ola decorativa al pie.
  ctx.fillStyle = '#0b3f63';
  ctx.beginPath();
  ctx.moveTo(0, ALTO - 170);
  ctx.bezierCurveTo(200, ALTO - 250, 380, ALTO - 100, 560, ALTO - 170);
  ctx.bezierCurveTo(740, ALTO - 240, 900, ALTO - 130, ANCHO, ALTO - 190);
  ctx.lineTo(ANCHO, ALTO);
  ctx.lineTo(0, ALTO);
  ctx.closePath();
  ctx.fill();

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#c6dcec';
  textoAjustado(ctx, `BOLETÍN OLAS · ${datos.fecha.toUpperCase()}`, MARGEN, 70, util, 36, cuerpo(600));

  ctx.fillStyle = '#ffffff';
  const lineas = datos.titular.split('\n');
  lineas.forEach((l, i) => textoAjustado(ctx, l, MARGEN, 130 + i * 100, util, 92, titulo));
  let y = 130 + lineas.length * 100 + 30;

  // Oleaje anómalo y temperatura del mar.
  const info = [datos.oleaje, datos.mar].filter(Boolean);
  if (info.length) {
    const alto = 30 + info.length * 56;
    ctx.fillStyle = 'rgba(8,19,28,0.35)';
    redondeado(ctx, MARGEN, y, util, alto, 24);
    ctx.fill();
    ctx.fillStyle = '#e8f1f8';
    info.forEach((t, i) => textoAjustado(ctx, t, MARGEN + 30, y + 22 + i * 56, util - 60, 36, cuerpo(500)));
    y += alto + 24;
  }

  // Playas: estado a la derecha y, debajo del nombre, sus cifras resumidas.
  const hueco = ALTO - 150 - y;
  const fila = Math.min(150, Math.floor(hueco / Math.max(1, datos.playas.length)) - 12);
  for (const p of datos.playas) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    redondeado(ctx, MARGEN, y, util, fila, 24);
    ctx.fill();
    ctx.fillStyle = COLOR_PUNTO[p.color] ?? COLOR_PUNTO.gris;
    ctx.beginPath();
    ctx.arc(MARGEN + 44, y + 44, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = cuerpo(700)(40);
    const anchoEstado = ctx.measureText(p.texto).width;
    ctx.fillText(p.texto, ANCHO - MARGEN - 30 - anchoEstado, y + 44);
    textoAjustado(ctx, p.nombre, MARGEN + 76, y + 44, util - 140 - anchoEstado, 42, cuerpo(600));
    if (p.detalle) {
      ctx.fillStyle = '#c6dcec';
      textoAjustado(ctx, p.detalle, MARGEN + 76, y + fila - 38, util - 106, 32, cuerpo(400));
    }
    ctx.textBaseline = 'top';
    y += fila + 12;
  }

  ctx.fillStyle = '#e8f1f8';
  if (datos.pie) textoAjustado(ctx, datos.pie, MARGEN, ALTO - 120, util, 36, cuerpo(500));
  ctx.fillStyle = '#c6dcec';
  ctx.font = cuerpo(400)(32);
  ctx.fillText(datos.url.replace(/^https?:\/\//, ''), MARGEN, ALTO - 70);
}
