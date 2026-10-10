// Utilidades para leer el HTML del portal del DHN (acordeones de avisos/boletines).

const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ordm: 'º', deg: '°', iexcl: '¡', iquest: '¿',
};

// Entidades con nombre conocidas y numéricas (&#243; / &#xF3;); las desconocidas quedan como están.
function decodificar(m, cuerpo) {
  if (cuerpo[0] === '#') {
    const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
    return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : m;
  }
  return ENTIDADES[cuerpo] ?? m;
}

export function htmlATexto(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodificar)
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
