// Lector mínimo de .xlsx (primera hoja) sin dependencias: un .xlsx es un zip con XML. Devuelve filas como objetos
// usando la primera fila como encabezado. Solo lo necesario para el registro de precios de Osinergmin.
import zlib from 'node:zlib';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTIDADES[e] ?? m;
});

function entradasZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No es un archivo zip/xlsx válido');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  for (let n = 0; n < total; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio del zip dañado');
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    entradas.set(nombre, { metodo, comprimido, local });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function contenido(buf, entradas, nombre) {
  const e = entradas.get(nombre);
  if (!e) return null;
  const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const datos = buf.subarray(inicio, inicio + e.comprimido);
  if (e.metodo === 0) return datos.toString('utf8');
  if (e.metodo === 8) return zlib.inflateRawSync(datos).toString('utf8');
  throw new Error(`Compresión zip no soportada (${e.metodo})`);
}

const columna = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function leerXlsx(buf) {
  const entradas = entradasZip(buf);
  const compartidas = [...(contenido(buf, entradas, 'xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decodificar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const hoja = contenido(buf, entradas, 'xl/worksheets/sheet1.xml');
  if (!hoja) throw new Error('El xlsx no tiene la hoja 1');
  const filas = [];
  for (const fila of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = [];
    for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      if (!ref) continue;
      const tipo = /\bt="(\w+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] ?? '')?.[1];
      celdas[columna(ref)] = tipo === 's' ? compartidas[Number(v)] : decodificar(inline ?? v ?? '');
    }
    filas.push(celdas);
  }
  const [encabezado, ...resto] = filas;
  if (!encabezado) return [];
  return resto.map((f) => Object.fromEntries(encabezado.map((k, i) => [k, f[i] ?? ''])));
}
