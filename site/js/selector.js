// Panel "Mis playas": ver las elegidas (ordenar y quitar) y agregar del catálogo, por texto o por cercanía.
// Solo presentación: recibe el estado y avisa los cambios. Al escribir se redibuja solo la lista de resultados,
// para que el campo no pierda el foco ni se cierre el teclado del celular.
import { buscar } from './catalogo.js';
import { MAX_PLAYAS, agregar, quitar, mover } from './mis-playas.js';

const KM_LEJOS = 50;

export function panelSelector({
  el, catalogo, ids, consulta, cerca, ubicando, mensaje, alCambiar, alBuscar, alUbicar, alCerrar,
}) {
  const porId = new Map(catalogo.playas.map((p) => [p.id, p]));
  const lleno = ids.length >= MAX_PLAYAS;

  // data-foco: app.js devuelve el foco al mismo control después de repintar.
  const boton = (texto, etiqueta, foco, alPulsar, deshabilitado = false) => {
    const b = el('button', { type: 'button', text: texto, 'aria-label': etiqueta, title: etiqueta, 'data-foco': foco });
    b.disabled = deshabilitado;
    b.addEventListener('click', alPulsar);
    return b;
  };
  const nombre = (p, extra) => el('span', { class: 'sel-nombre' },
    el('strong', { text: p.nombre }), el('small', { class: 'gris', text: extra ? `${p.region} · ${extra}` : p.region }));

  const elegidas = ids.map((id, i) => {
    const p = porId.get(id);
    return el('li', {}, nombre(p), el('span', { class: 'sel-botones' },
      boton('↑', `Subir ${p.nombre}`, `subir-${id}`, () => alCambiar(mover(ids, id, -1)), i === 0),
      boton('↓', `Bajar ${p.nombre}`, `bajar-${id}`, () => alCambiar(mover(ids, id, 1)), i === ids.length - 1),
      boton('✕', `Quitar ${p.nombre}`, `quitar-${id}`, () => alCambiar(quitar(ids, id)))));
  });

  const fila = (p, extra) => {
    const puesta = ids.includes(p.id);
    return el('li', {}, nombre(p, extra), el('span', { class: 'sel-botones' },
      boton(puesta ? '✔' : '+', puesta ? `${p.nombre} ya está en Mis playas` : `Agregar ${p.nombre}`, `agregar-${p.id}`,
        () => alCambiar(agregar(ids, p.id)), puesta || lleno)));
  };

  const resultados = el('div', { class: 'sel-resultados' });
  const dibujar = (texto, proximas) => {
    if (proximas) {
      const lejos = proximas[0] && proximas[0].km > KM_LEJOS;
      resultados.replaceChildren(
        ...[
          lejos ? el('p', { class: 'nota', text: `La playa más cercana del catálogo está a ${Math.round(proximas[0].km)} km.` }) : null,
          el('ul', {}, proximas.map(({ playa, km }) => fila(playa, `a ${km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : Math.round(km)} km en línea recta`))),
        ].filter(Boolean),
      );
      return;
    }
    const halladas = buscar(catalogo.playas, texto);
    if (!halladas.length) {
      resultados.replaceChildren(el('p', { class: 'gris', text: 'No encuentro esa playa en el catálogo. Prueba con la región.' }));
      return;
    }
    if (texto.trim()) {
      resultados.replaceChildren(el('ul', {}, halladas.map((p) => fila(p))));
      return;
    }
    // Sin consulta: agrupadas por región, de norte a sur.
    const regiones = [...new Set(halladas.map((p) => p.region))];
    resultados.replaceChildren(...regiones.flatMap((r) => [
      el('h3', { text: r }),
      el('ul', {}, halladas.filter((p) => p.region === r).map((p) => fila(p))),
    ]));
  };
  dibujar(consulta, cerca);

  const campo = el('input', {
    type: 'search', class: 'sel-buscar', placeholder: 'Buscar por nombre o región…', 'aria-label': 'Buscar playa por nombre o región',
    autocomplete: 'off', 'data-foco': 'buscar-playa',
  });
  campo.value = consulta;
  campo.addEventListener('input', () => {
    alBuscar(campo.value);
    dibujar(campo.value, null);
  });

  return el('section', { class: 'selector', 'aria-label': 'Mis playas' },
    el('h2', { text: ids.length ? 'Mis playas' : 'Agrega tu playa' }),
    ids.length ? el('ul', { class: 'sel-elegidas' }, elegidas) : el('p', { class: 'gris', text: `Elige hasta ${MAX_PLAYAS} playas donde remas. Quedan guardadas en este celular.` }),
    ids.length ? boton('Listo', 'Listo: ver mis playas', 'listo', alCerrar) : null,
    el('h3', { class: 'sel-titulo', text: 'Agregar playa' }),
    lleno ? el('p', { class: 'nota', role: 'status', text: `Máximo ${MAX_PLAYAS} playas: quita una para agregar otra.` }) : null,
    el('div', { class: 'sel-barra' }, campo,
      boton(ubicando ? 'Buscando…' : '📍 Cerca de mí', 'Cerca de mí: usar la ubicación de este dispositivo', 'cerca', alUbicar, ubicando)),
    el('p', { class: 'gris pequeno', text: 'Tu ubicación se usa solo en este dispositivo: no se guarda ni se envía.' }),
    mensaje ? el('p', { class: 'nota', role: 'status', text: mensaje }) : null,
    resultados);
}
