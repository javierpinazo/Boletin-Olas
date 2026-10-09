// Utilidades para leer el HTML del portal del DHN (acordeones de avisos/boletines).

const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function htmlATexto(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTIDADES[m])
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Cada aviso/boletín del portal es un <div class="position-relative"> con
// accordion-header-links (enlace al PDF con el id), accordion-title y accordion-content.
export function separarItems(html) {
  return html
    .split('<div class="position-relative">')
    .slice(1)
    .map((trozo) => {
      const titulo = trozo.match(/<div class="accordion-title">([\s\S]*?)<\/div>/);
      const contenido = trozo.split('<div class="accordion-content">')[1];
      if (!titulo || contenido === undefined) return null;
      const id = trozo.match(/pdf-aviso-especial\/(\d+)/);
      return {
        id: id ? id[1] : null,
        titulo: htmlATexto(titulo[1]).replace(/\s*\[[^\]]*\]\s*$/, ''),
        texto: htmlATexto(contenido),
      };
    })
    .filter(Boolean);
}
