// "Comparte el día" (modo océano): una imagen resumen para el grupo de remo y su versión en texto.
// Solo presentación: recibe el resumen ya calculado por app.js.

export const COLOR_PUNTO = { verde: '#5fd394', amarillo: '#f2c14e', naranja: '#f2c14e', rojo: '#ff8a7a', gris: '#a9c2d6' };

// datos: { fecha, titular, playas: [{ nombre, color, texto }], pie, url }
export function textoResumen(datos) {
  return [
    `Boletín Olas · ${datos.fecha}`,
    datos.titular,
    ...datos.playas.map((p) => `• ${p.nombre}: ${p.texto}`),
    datos.pie,
    datos.url,
  ].filter(Boolean).join('\n');
}

export const enlaceWhatsapp = (datos) => `https://wa.me/?text=${encodeURIComponent(textoResumen(datos))}`;

const ANCHO = 1080;
const ALTO = 1350;

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Dibuja la tarjeta 1080×1350 (formato vertical de redes) en el canvas dado.
export function dibujarTarjeta(canvas, datos) {
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  const titulo = '700 {t}px "Space Grotesk", "Segoe UI", system-ui, sans-serif';
  const cuerpo = '{p} {t}px Inter, "Segoe UI", system-ui, sans-serif';
  const fuente = (base, t, p = 400) => base.replace('{t}', t).replace('{p}', p);

  ctx.fillStyle = '#0e4f7a';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Ola decorativa al pie.
  ctx.fillStyle = '#0b3f63';
  ctx.beginPath();
  ctx.moveTo(0, ALTO - 210);
  ctx.bezierCurveTo(200, ALTO - 290, 380, ALTO - 140, 560, ALTO - 210);
  ctx.bezierCurveTo(740, ALTO - 280, 900, ALTO - 170, ANCHO, ALTO - 230);
  ctx.lineTo(ANCHO, ALTO);
  ctx.lineTo(0, ALTO);
  ctx.closePath();
  ctx.fill();

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#c6dcec';
  ctx.font = fuente(cuerpo, 40, 600);
  ctx.fillText(`BOLETÍN OLAS · ${datos.fecha.toUpperCase()}`, 80, 90);

  ctx.fillStyle = '#ffffff';
  ctx.font = fuente(titulo, 104);
  const lineas = datos.titular.split('\n');
  lineas.forEach((l, i) => ctx.fillText(l, 80, 170 + i * 112));

  let y = 200 + lineas.length * 112 + 40;
  for (const p of datos.playas) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    redondeado(ctx, 80, y, ANCHO - 160, 130, 28);
    ctx.fill();
    ctx.fillStyle = COLOR_PUNTO[p.color] ?? COLOR_PUNTO.gris;
    ctx.beginPath();
    ctx.arc(130, y + 65, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.font = fuente(cuerpo, 46, 600);
    ctx.fillText(p.nombre, 175, y + 65);
    ctx.font = fuente(cuerpo, 44, 700);
    const w = ctx.measureText(p.texto).width;
    ctx.fillText(p.texto, ANCHO - 120 - w, y + 65);
    ctx.textBaseline = 'top';
    y += 154;
  }

  ctx.fillStyle = '#e8f1f8';
  ctx.font = fuente(cuerpo, 40, 500);
  ctx.fillText(datos.pie, 80, ALTO - 150);
  ctx.fillStyle = '#c6dcec';
  ctx.font = fuente(cuerpo, 36, 400);
  ctx.fillText(datos.url.replace(/^https?:\/\//, ''), 80, ALTO - 95);
}
