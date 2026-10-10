import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso, parsearLinea, AvisoNoEntendido } from '../job/parse-aviso.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('aviso 39-26: validez, emisión, luna y tramos', () => {
  const a = parseAviso(separarItems(leer('avisos-oleaje.html'))[0]);
  assert.equal(a.numero, '39-26');
  assert.equal(a.validoDesde, '2026-10-08');
  assert.equal(a.validoHasta, '2026-10-12');
  assert.equal(a.emitidoEn, '2026-10-07');
  assert.equal(a.faseLunar, 'cuarto menguante');
  assert.equal(a.url, 'https://www.dhn.mil.pe/portal/avisos-especiales/5340');
  assert.deepEqual(
    a.tramos.map((t) => [t.desde, t.hasta, t.desdeExclusivo]),
    [
      ['tumbes', 'salaverry', false],
      ['salaverry', 'callao', true],
      ['callao', 'san juan de marcona', true],
      ['san juan de marcona', 'tacna', true],
    ],
  );
  const sur = a.tramos[2];
  assert.deepEqual(sur.linea, [
    { nivel: 'ligero', desde: '2026-10-07T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-10-07T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-10-09T12:00:00-05:00' },
  ]);
  assert.deepEqual(a.tramos[1].linea[1], { nivel: 'moderado', desde: '2026-10-07T18:00:00-05:00' });
});

test('aviso 38-26: el límite del subtramo está en Chancay y "mismo día" sigue a la fecha previa', () => {
  const a = parseAviso(separarItems(leer('avisos-oleaje.html'))[1]);
  assert.equal(a.numero, '38-26');
  assert.deepEqual(a.tramos.map((t) => t.hasta), ['salaverry', 'chancay', 'san juan de marcona', 'tacna']);
  assert.deepEqual(a.tramos[1].linea, [
    { nivel: 'ligero', desde: '2026-10-06T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-10-06T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-10-08T06:00:00-05:00' },
  ]);
  assert.deepEqual(a.tramos[2].linea[0], { nivel: 'ligero', desde: '2026-10-05T06:00:00-05:00' });
});

test('validez que cruza de mes: "del 30 de setiembre al 01 de octubre"', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 37-26 (Válido del 30 de setiembre al 01 de octubre del 2026)',
    texto: 'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste desde la tarde del miércoles 30 de setiembre.\nCallao, 29 de setiembre 2026',
  });
  assert.equal(a.validoDesde, '2026-09-30');
  assert.equal(a.validoHasta, '2026-10-01');
  assert.deepEqual(a.tramos[0].linea, [{ nivel: 'ligero', desde: '2026-09-30T12:00:00-05:00' }]);
});

test('niveles fuerte y muy fuerte', () => {
  const l = parsearLinea('Arribo de oleaje ligero desde la mañana del lunes 05 de octubre, incrementando a fuerte desde la tarde del mismo día y a muy fuerte desde la noche del martes 06', '2026-10-03');
  assert.deepEqual(l.map((p) => p.nivel), ['ligero', 'fuerte', 'muy fuerte']);
  assert.equal(l[2].desde, '2026-10-06T18:00:00-05:00');
});

test('cláusula sin niveles devuelve null', () => {
  assert.equal(parsearLinea('', '2026-10-03'), null);
});

test('redacción nueva: el aviso se rechaza con AvisoNoEntendido (no inventa datos)', () => {
  const item = separarItems(leer('aviso-redaccion-nueva.html'))[0];
  assert.throws(() => parseAviso(item), AvisoNoEntendido);
});

test('nivel sin momento de inicio (salvo el primero) se rechaza', () => {
  assert.throws(
    () => parsearLinea('oleaje ligero desde el 29, moderado en la noche, ligero desde el 31', '2026-05-28'),
    AvisoNoEntendido,
  );
});

test('día imposible se rechaza', () => {
  assert.throws(() => parsearLinea('oleaje ligero desde el viernes 31', '2026-10-03'), AvisoNoEntendido);
});

test('línea de tiempo desordenada se rechaza', () => {
  assert.throws(
    () => parsearLinea('oleaje ligero desde la tarde del martes 06, moderado desde la mañana del martes 06', '2026-10-03'),
    AvisoNoEntendido,
  );
});

const TITULO_40 = 'AVISO ESPECIAL DE OLEAJE NRO. 40-26 (Válido del 07 al 10 de octubre del 2026)';
const aviso40 = (lineas) => ({
  titulo: TITULO_40,
  texto: `El estado del mar presentará las siguientes condiciones:\n${lineas}\nCallao, 07 de octubre 2026`,
});

test('viñetas distintas de "?" (▪, glifo privado de Wingdings) siguen siendo tramos', () => {
  for (const vineta of ['▪', '\uF0A7', '•', '-']) {
    const a = parseAviso(aviso40(`b) Litoral Centro (Zona al sur de Salaverry hasta San Juan de Marcona):\n${vineta} Al sur de Callao hasta San Juan de Marcona: Oleaje fuerte del suroeste desde la tarde del jueves 08 de octubre.`));
    assert.equal(a.tramos.length, 1, `viñeta ${JSON.stringify(vineta)}`);
    assert.deepEqual([a.tramos[0].desde, a.tramos[0].hasta], ['callao', 'san juan de marcona']);
    assert.equal(a.tramos[0].linea[0].nivel, 'fuerte');
  }
});

test('una línea de tramo con niveles que no se puede leer rechaza el aviso (no se descarta en silencio)', () => {
  assert.throws(
    () => parseAviso(aviso40('a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero desde el 07\nd) Al sur de Callao hasta Pisco - oleaje fuerte desde la tarde del jueves 08')),
    AvisoNoEntendido,
  );
});

test('la nota de clasificación ("hasta en un 50 %") no se confunde con un tramo', () => {
  const a = parseAviso(aviso40('a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero desde el 07\nNota: clasificación\na. Oleaje Ligero: El mar presenta alturas de olas hasta en un 50 % más sobre sus características normales.'));
  assert.equal(a.tramos.length, 1);
});

// ---------- Variantes de título vistas en los avisos reales de 2026 ----------

// Sin fecha de emisión ni horas: la emisión cae en el inicio de la validez del título de cada caso.
const CUERPO_MINIMO = 'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste.';
const conTitulo = (titulo) => parseAviso({ titulo, texto: CUERPO_MINIMO });

test('título: el número se lee con NRO./Nro./N°/Nº y con o sin espacios alrededor del guion', () => {
  for (const prefijo of ['NRO. 25 - 26', 'NRO. 25-26', 'Nro. 25-26', 'N° 25 - 26', 'Nº 25-26', 'NRO 25-26']) {
    const a = conTitulo(`AVISO ESPECIAL DE OLEAJE ${prefijo} (Válido del 07 al 11 de octubre 2026)`);
    assert.equal(a.numero, '25-26', prefijo);
  }
});

test('título: conserva los ceros del número tal como lo escribe el DHN', () => {
  assert.equal(conTitulo('AVISO ESPECIAL DE OLEAJE NRO. 09 - 26 (Válido del 07 al 11 de octubre 2026)').numero, '09-26');
});

test('validez: "a" en vez de "al", sin "del" antes del año, mes con mayúsculas y punto final', () => {
  const casos = [
    ['(Válido del 09 a 13 de setiembre del 2026)', '2026-09-09', '2026-09-13'],
    ['(Válido del 07 al 11 de agosto 2026)', '2026-08-07', '2026-08-11'],
    ['(Válido del 04 al 07 de juLio 2026)', '2026-07-04', '2026-07-07'],
    ['(ACTUALIZACIÓN - Válido del 13 al 17 de Febrero 2026).', '2026-02-13', '2026-02-17'],
  ];
  for (const [validez, desde, hasta] of casos) {
    const a = conTitulo(`AVISO ESPECIAL DE OLEAJE NRO. 30 - 26 ${validez}`);
    assert.deepEqual([a.validoDesde, a.validoHasta], [desde, hasta], validez);
  }
});

test('validez: "del 29 al 06 de mayo" arranca el mes anterior', () => {
  const a = conTitulo('AVISO ESPECIAL DE OLEAJE NRO. 17 - 26 (Válido del 29 al 06 de mayo 2026)');
  assert.deepEqual([a.validoDesde, a.validoHasta], ['2026-04-29', '2026-05-06']);
  const b = conTitulo('AVISO ESPECIAL DE OLEAJE NRO. 17 - 26 (Válido del 29 al 02 de enero 2027)');
  assert.deepEqual([b.validoDesde, b.validoHasta], ['2026-12-29', '2027-01-02']);
});

test('validez: cruce de año con meses explícitos', () => {
  const a = conTitulo('AVISO ESPECIAL DE OLEAJE NRO. 50 - 26 (Válido del 30 de diciembre al 02 de enero del 2027)');
  assert.deepEqual([a.validoDesde, a.validoHasta], ['2026-12-30', '2027-01-02']);
});

test('validez: título sin fechas sigue rechazándose', () => {
  assert.throws(() => conTitulo('AVISO ESPECIAL DE OLEAJE NRO. 30 - 26'), AvisoNoEntendido);
});

// ---------- Variantes del cuerpo vistas en los avisos reales de 2026 ----------

const NL = String.fromCharCode(10);
const avisoCon = (...lineas) => ({
  titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 24 - 26 (Válido del 07 al 11 de octubre 2026)',
  texto: [...lineas, 'Callao, 06 de octubre 2026'].join(NL),
});

test('cuerpo: "a partir de" y "en la tarde" valen como "desde la tarde"', () => {
  const l = parsearLinea('Arribo de oleaje ligero del suroeste a partir de la noche del sábado 27, incrementando a moderado en la tarde del domingo 28 y decreciendo a ligero a partir de la mañana del lunes 29', '2026-06-24');
  assert.deepEqual(l, [
    { nivel: 'ligero', desde: '2026-06-27T18:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-06-28T12:00:00-05:00' },
    { nivel: 'ligero', desde: '2026-06-29T06:00:00-05:00' },
  ]);
});

test('cuerpo: intensificándose / escalando / atenuándose con "en la mañana" (aviso 22-26, muy fuerte)', () => {
  const l = parsearLinea('Persiste el oleaje ligero del suroeste, incrementando a moderado desde la noche del sábado 06, intensificándose a fuerte en la mañana del domingo 07 y escalando a muy fuerte en la noche del mismo día, atenuándose a fuerte en la mañana del lunes 08', '2026-06-03');
  assert.deepEqual(l.map((p) => [p.nivel, p.desde]), [
    ['ligero', '2026-06-03T00:00:00-05:00'],
    ['moderado', '2026-06-06T18:00:00-05:00'],
    ['fuerte', '2026-06-07T06:00:00-05:00'],
    ['muy fuerte', '2026-06-07T18:00:00-05:00'],
    ['fuerte', '2026-06-08T06:00:00-05:00'],
  ]);
});

test('cuerpo: "a partir de la tarde martes 14" (sin "del" antes del día de la semana)', () => {
  const l = parsearLinea('Arribo de oleaje ligero del suroeste a partir de la tarde martes 14', '2026-04-12');
  assert.deepEqual(l, [{ nivel: 'ligero', desde: '2026-04-14T12:00:00-05:00' }]);
});

test('cuerpo: "con intermitencia de moderado" se asume moderado todo el periodo (lado seguro)', () => {
  const l = parsearLinea('Persiste oleaje ligero del suroeste con intermitencia de moderado.', '2026-03-16');
  assert.deepEqual(l, [
    { nivel: 'ligero', desde: '2026-03-16T00:00:00-05:00' },
    { nivel: 'moderado', desde: '2026-03-16T00:00:00-05:00' },
  ]);
});

test('cuerpo: sin "intermitencia", un nivel sin momento de inicio sigue rechazándose', () => {
  assert.throws(() => parsearLinea('Oleaje ligero del suroeste, luego moderado en el litoral', '2026-03-16'), AvisoNoEntendido);
});

test('viñetas: "a." con punto y "o" como en los avisos de julio-agosto', () => {
  const a = parseAviso(avisoCon(
    'a. Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste desde la tarde del miércoles 07 de octubre.',
    'b. Litoral Centro (Zona al sur de Salaverry hasta San Juan de Marcona):',
    'o Al sur de Salaverry hasta Chancay: Arribo de oleaje ligero del suroeste desde la mañana del jueves 08 de octubre.',
    'o Al sur de Chancay hasta San Juan de Marcona: Persiste el oleaje ligero del suroeste.',
  ));
  assert.deepEqual(a.tramos.map((t) => [t.desde, t.hasta]), [
    ['tumbes', 'salaverry'], ['salaverry', 'chancay'], ['chancay', 'san juan de marcona'],
  ]);
});

test('viñetas: la nota "a. Oleaje Ligero: El mar presenta alturas…" sigue sin confundirse con un tramo', () => {
  const a = parseAviso(avisoCon(
    'a. Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste desde la tarde del miércoles 07 de octubre.',
    'Nota: Clasificación del estado de mar en la zona costera',
    'a. Oleaje Ligero: El mar presenta alturas de olas hasta en un 50 % más sobre sus características normales.',
    'd. Oleaje Muy Fuerte: El mar presenta alturas de olas superiores a tres veces más sobre sus condiciones normales.',
  ));
  assert.equal(a.tramos.length, 1);
});

test('cuerpo: "moderado, con intermitencia de fuerte, desde la tarde del viernes" — la hora vale para ambos (18-26)', () => {
  const l = parsearLinea('Arribo de oleaje ligero del suroeste desde la tarde del jueves 07 incrementando a moderado, con intermitencia de fuerte, desde la tarde del viernes 08; disminuyendo a ligero en la noche del domingo 10 de mayo.', '2026-05-05');
  assert.deepEqual(l.map((p) => [p.nivel, p.desde]), [
    ['ligero', '2026-05-07T12:00:00-05:00'],
    ['moderado', '2026-05-08T12:00:00-05:00'],
    ['fuerte', '2026-05-08T12:00:00-05:00'],
    ['ligero', '2026-05-10T18:00:00-05:00'],
  ]);
});

test('cuerpo: día de la semana sin número ("desde la tarde del jueves")', () => {
  const l = parsearLinea('Oleaje ligero del suroeste desde la tarde del jueves', '2026-10-07');
  assert.deepEqual(l, [{ nivel: 'ligero', desde: '2026-10-08T12:00:00-05:00' }]);
});

test('viñetas: una línea de tramo puede venir sin viñeta ("Al sur de Salaverry hasta Chimbote: …")', () => {
  const a = parseAviso(avisoCon(
    'a. Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero del suroeste desde la tarde del miércoles 07 de octubre.',
    'Al sur de Salaverry hasta Chimbote: Arribo de oleaje ligero del suroeste desde la mañana del jueves 08 de octubre.',
  ));
  assert.deepEqual(a.tramos.map((t) => [t.desde, t.hasta]), [['tumbes', 'salaverry'], ['salaverry', 'chimbote']]);
});

test('tramo: una palabra suelta antes de "Al sur de" ("Arribo Al sur de Salaverry hasta Chancay", 36-26) no ensucia el límite', () => {
  const a = parseAviso(avisoCon(
    'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Arribo de oleaje ligero del suroeste desde la madrugada del miércoles 07 de octubre.',
    '? Arribo Al sur de Salaverry hasta Chancay: Arribo de oleaje ligero del suroeste desde la mañana del miércoles 07 de octubre.',
  ));
  assert.deepEqual(a.tramos.map((t) => [t.desde, t.hasta, t.desdeExclusivo]), [['tumbes', 'salaverry', false], ['salaverry', 'chancay', true]]);
});

test('"Condiciones normales" es un tramo válido con nivel normal (36-26: al sur de Chancay)', () => {
  const a = parseAviso(avisoCon(
    'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Arribo de oleaje ligero del suroeste desde la madrugada del miércoles 07 de octubre.',
    'b) Litoral Centro (Zona al sur de Salaverry hasta San Juan de Marcona):',
    '? Al sur de Chancay hasta San Juan de Marcona: Condiciones normales.',
  ));
  assert.equal(a.tramos.length, 2);
  assert.deepEqual(a.tramos[1].linea, [{ nivel: 'normal', desde: '2026-10-06T00:00:00-05:00' }]);
});

test('vuelta a "condiciones normales" dentro de una línea de tiempo', () => {
  const l = parsearLinea('Persiste oleaje ligero del suroeste, retornando a condiciones normales desde la tarde del jueves 08', '2026-10-06');
  assert.deepEqual(l, [
    { nivel: 'ligero', desde: '2026-10-06T00:00:00-05:00' },
    { nivel: 'normal', desde: '2026-10-08T12:00:00-05:00' },
  ]);
});

// ---------- Horizonte real del aviso (el título a veces queda corto: 24-26, 15-26) ----------

test('horizonte: "presentes en nuestro litoral hasta el viernes 26 de junio" extiende la validez del título', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 24 - 26 (Válido del 21 al 23 de junio 2026)',
    texto: [
      'a) Litoral Norte (Zona de Tumbes hasta Salaverry): Arribo de oleaje ligero del suroeste desde la mañana del lunes 22, incrementando a moderado en la tarde del martes 23 y disminuyendo a ligero en la tarde del miércoles 24 de junio.',
      '2. Estos oleajes estarán presentes en nuestro litoral hasta el viernes 26 de junio y tendrán mayor impacto en las playas abiertas.',
      'Callao, 20 de junio 2026',
    ].join(String.fromCharCode(10)),
  });
  assert.equal(a.validoHasta, '2026-06-26');
});

test('horizonte: sin la frase, vale el último punto de la línea de tiempo si pasa del título', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 24 - 26 (Válido del 21 al 23 de junio 2026)',
    texto: ['a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero desde la mañana del lunes 22, incrementando a moderado en la tarde del martes 23 y disminuyendo a ligero en la tarde del miércoles 24 de junio.', 'Callao, 20 de junio 2026'].join(String.fromCharCode(10)),
  });
  assert.equal(a.validoHasta, '2026-06-24');
});

test('horizonte: un horizonte más corto que el título no recorta la validez', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 24 - 26 (Válido del 21 al 27 de junio 2026)',
    texto: ['a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero desde la mañana del lunes 22.', '2. Estos oleajes estarán presentes en nuestro litoral hasta el martes 23 de junio.', 'Callao, 20 de junio 2026'].join(String.fromCharCode(10)),
  });
  assert.equal(a.validoHasta, '2026-06-27');
});

test('horizonte: cruce de año ("hasta el 02 de enero" en un aviso de diciembre)', () => {
  const a = parseAviso({
    titulo: 'AVISO ESPECIAL DE OLEAJE NRO. 50 - 26 (Válido del 28 al 31 de diciembre 2026)',
    texto: ['a) Litoral Norte (Zona de Tumbes hasta Salaverry): Oleaje ligero desde la mañana del lunes 28.', '2. Estos oleajes estarán presentes en nuestro litoral hasta el sábado 02 de enero y tendrán mayor impacto en las playas abiertas.', 'Callao, 27 de diciembre 2026'].join(String.fromCharCode(10)),
  });
  assert.equal(a.validoHasta, '2027-01-02');
});
