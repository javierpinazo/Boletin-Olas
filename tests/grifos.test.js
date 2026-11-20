import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { leerXlsx } from '../job/xlsx.js';
import { construirGrifos, fechaExcel, escribirGrifos } from '../job/grifos.js';

// Arma un .xlsx mínimo (zip con sharedStrings y una hoja) para probar el lector sin depender de un archivo real.
function zip(entradas) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const [nombre, texto] of Object.entries(entradas)) {
    const datos = zlib.deflateRawSync(Buffer.from(texto));
    const n = Buffer.from(nombre);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(texto.length, 22); local.writeUInt16LE(n.length, 26);
    locales.push(local, n, datos);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(datos.length, 20); central.writeUInt32LE(texto.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    centrales.push(central, n);
    offset += 30 + n.length + datos.length;
  }
  const cd = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(entradas).length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, fin]);
}

const COLS = ['NRO_REGISTRO', 'RAZON', 'DEPARTAMENTO', 'PROVINCIA', 'DISTRITO', 'DIRECCION', 'FCHA_REGISTRO', 'PRODUCTO', 'PRECIO_VENTA', 'CODIGO_OSINERG', 'PRODUCTO_ACTIVO'];

function xlsx(filas) {
  const textos = [];
  const idx = (t) => { let i = textos.indexOf(t); if (i < 0) { textos.push(t); i = textos.length - 1; } return i; };
  const letra = (i) => String.fromCharCode(65 + i);
  const celda = (v, r, i) => (typeof v === 'number' ? `<c r="${letra(i)}${r}"><v>${v}</v></c>` : `<c r="${letra(i)}${r}" t="s"><v>${idx(v)}</v></c>`);
  const filasXml = [COLS, ...filas].map((f, r) => `<row r="${r + 1}">${f.map((v, i) => celda(v, r + 1, i)).join('')}</row>`).join('');
  const compartidas = `<sst>${textos.map((t) => `<si><t>${t.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`;
  return zip({ 'xl/sharedStrings.xml': compartidas, 'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${filasXml}</sheetData></worksheet>` });
}

const fila = (cod, razon, distrito, dir, fecha, precio, extra = {}) => {
  const base = {
    NRO_REGISTRO: `${cod}-050`, RAZON: razon, DEPARTAMENTO: 'LIMA', PROVINCIA: 'LIMA', DISTRITO: distrito, DIRECCION: dir,
    FCHA_REGISTRO: fecha, PRODUCTO: 'GASOHOL PREMIUM', PRECIO_VENTA: precio, CODIGO_OSINERG: cod, PRODUCTO_ACTIVO: 'SI', ...extra,
  };
  return COLS.map((c) => base[c]);
};

const config = {
  grifos: {
    producto: 'GASOHOL PREMIUM', etiqueta: 'Gasohol premium', maximoDiasPrecio: 30, cuantosPorZona: 1, cuantosLima: 2,
    favoritos: [{ nombre: 'Mi grifo', codigo: '1' }, { nombre: 'No existe', codigo: '999' }],
    zonas: [
      { nombre: 'Molina', distritos: ['La Molina'], avenidas: ['Javier Prado'] },
      { nombre: 'Sur', distritos: ['Chorrillos'], avenidas: ['Panamericana Sur'] },
    ],
  },
};
const ahora = new Date('2026-11-20T16:00:00Z');
const hoy = 46346.5; // 2026-11-20

test('fechaExcel: serie de Excel a fecha ISO', () => {
  assert.equal(fechaExcel(46346.5), '2026-11-20');
  assert.equal(fechaExcel('46344.565'), '2026-11-18');
});

test('leerXlsx: lee texto compartido, números y respeta las columnas', () => {
  const filas = leerXlsx(xlsx([fila('1', 'A & B S.A.', 'LA MOLINA', 'AV. X', 46000, 21.5)]));
  assert.equal(filas.length, 1);
  assert.equal(filas[0].RAZON, 'A & B S.A.');
  assert.equal(filas[0].PRECIO_VENTA, '21.5');
  assert.equal(filas[0].CODIGO_OSINERG, '1');
});

test('leerXlsx: un archivo que no es xlsx falla con un mensaje claro', () => {
  assert.throws(() => leerXlsx(Buffer.from('no soy un zip')), /zip/);
});

test('construirGrifos: favoritos, tramos de la ruta y los más baratos de Lima', () => {
  const filas = leerXlsx(xlsx([
    fila('1', 'MI GRIFO', 'ATE', 'AV. UNO', hoy, 22.5),
    fila('2', 'BARATO MOLINA', 'LA MOLINA', 'AV. LA MOLINA', hoy, 20.1),
    fila('3', 'CARO MOLINA', 'LA MOLINA', 'AV. LA MOLINA 2', hoy, 23.9),
    fila('4', 'PAN SUR', 'LURIN', 'CARRETERA PANAMERICANA SUR KM 30', hoy, 19.5),
    fila('5', 'ANTIGUO', 'CHORRILLOS', 'AV. VIEJA', hoy - 40, 10.0), // precio de hace 40 días: se ignora
    fila('6', 'OTRO PRODUCTO', 'LA MOLINA', 'AV. Z', hoy, 5.0, { PRODUCTO: 'DIESEL' }),
    fila('7', 'OTRA CIUDAD', 'CUSCO', 'AV. C', hoy, 18.0, { DEPARTAMENTO: 'CUSCO', PROVINCIA: 'CUSCO' }),
    fila('8', 'INACTIVO', 'LA MOLINA', 'AV. I', hoy, 15.0, { PRODUCTO_ACTIVO: 'NO' }),
  ]));
  const d = construirGrifos(filas, { config, ahora });
  assert.deepEqual(d.favoritos.map((f) => [f.nombre, f.precio ?? null, f.sinPrecio ?? false]), [['Mi grifo', 22.5, false], ['No existe', null, true]]);
  assert.deepEqual(d.zonas.map((z) => [z.nombre, z.grifos.map((g) => g.razon)]), [['Molina', ['BARATO MOLINA']], ['Sur', ['PAN SUR']]]);
  assert.deepEqual(d.lima.map((g) => g.razon), ['PAN SUR', 'BARATO MOLINA']);
  assert.equal(d.zonas[0].grifos[0].dias, 0);
  assert.equal(d.producto, 'Gasohol premium');
});

test('construirGrifos: con varias filas del mismo grifo gana la de registro más reciente', () => {
  const filas = leerXlsx(xlsx([
    fila('2', 'G', 'LA MOLINA', 'AV. A', hoy - 5, 25.0),
    fila('2', 'G', 'LA MOLINA', 'AV. A', hoy, 21.0),
  ]));
  assert.equal(construirGrifos(filas, { config, ahora }).zonas[0].grifos[0].precio, 21);
});

test('escribirGrifos: si Osinergmin falla no escribe nada ni lanza', async () => {
  const fallo = async () => ({ ok: false, status: 503 });
  await assert.doesNotReject(() => escribirGrifos(config, 'no-debe-existir/grifos.json', { fetchFn: fallo, ahora }));
});
