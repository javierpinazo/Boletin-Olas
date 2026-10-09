# Boletín Olas — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** una página web (móvil primero) que responde "¿es buen día para remar en mar calmo hoy en San Bartolo, Punta Hermosa, Yuyos o La Punta?", con el aviso de oleaje y los boletines de sismo/tsunami del DHN más oleaje y viento por playa.

**Arquitectura:** un job de Node (GitHub Actions: cron diario y botón manual) lee las páginas del DHN, las interpreta con parsers deterministas y escribe `data/dhn.json`. GitHub Pages sirve `site/` + `data/dhn.json`. El navegador consulta Open-Meteo en vivo y calcula el semáforo por playa y por hora con un scorer puro y probado.

**Stack:** Node ≥ 22 sin dependencias (`node:test`, `fetch` nativo), JS plano con módulos ES en el navegador (sin build ni framework), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-09-boletin-olas-design.md`

> **Cambios respecto al spec aprobado** (descubiertos al probar contra el DHN real; el spec ya está actualizado):
> 1. `data/dhn.json` se reescribe y se commitea **todos los días**, cambie o no el aviso. Si solo se escribiera al cambiar, `generadoEn` quedaría viejo y la página marcaría "desactualizado" tras 36 h entre avisos. Además el commit diario evita que GitHub pause el cron por inactividad.
> 2. Por cada evento sísmico (p. ej. `28-2026`) solo vale el boletín de mayor versión: el `28-2026-1` dice "se intensifica vigilancia" y el `28-2026-2` concluye "no genera tsunami". Evaluar los dos por separado daría una alerta falsa.
> 3. Hay boletines de alerta con otro formato, sin la línea "El día … hora local" (p. ej. el real `31-2025-5`, Kamchatka). Sin fecha, la vigencia se cuenta desde que el job lo vio por primera vez (`vistoEn`), y los de años anteriores se descartan.
> 4. La ventana horaria es `[06:00, 17:00)`: la última hora evaluada es la de las 16:00 y un bloque puede terminar a las 17:00.

## Restricciones globales

- Node ≥ 22, **cero dependencias** npm; pruebas con `node --test`; módulos ES (`"type": "module"`).
- Navegador: HTML/CSS/JS planos, sin build ni framework. Todo texto que venga del DHN o de Open-Meteo entra al DOM con `textContent`, nunca como HTML.
- Sin claves, tokens ni proxies públicos. Sin LLM.
- Zona horaria fija de Lima (UTC-5, sin horario de verano); instantes con sufijo `-05:00`.
- Ventana de evaluación 06:00–17:00 (hora de fin exclusiva); bloque mínimo 2 horas seguidas.
- Umbrales (verde / amarillo / rojo): altura ≤ 0,8 m / 0,8–1,3 m / > 1,3 m; periodo: verde si Hs ≤ 0,6 m o T ≤ 12 s, amarillo si 12 < T ≤ 14 s con Hs > 0,6 m (o T > 14 s con 0,6 < Hs ≤ 0,8), rojo si T > 14 s con Hs > 0,8 m; viento ≤ 12 / 12–20 / > 20 km/h; terral (dirección 20°–160°) ≤ 8 / 8–15 / > 15 km/h; DHN normal-ligero / moderado / fuerte-muy fuerte.
- Frase que marca un boletín sin riesgo: "NO GENERA TSUNAMI EN LITORAL PERUANO". Un boletín reciente sin esa frase, o ilegible, es alerta.
- Regla de oro: nunca mostrar un verde sin respaldo. Datos que faltan o están desactualizados ⇒ tope amarillo, jamás verde.
- Cron: `30 10 * * *` (05:30 hora de Lima) más `workflow_dispatch`.
- Repo remoto: `https://github.com/javierpinazo/Boletin-Olas.git` (rama `main`). **No hagas `git push` hasta la Tarea 8 y solo con confirmación del usuario.**

## Review Focus

Entradas o fallos que el spec insinúa y que más probablemente afectan a quien use la app (cada una ya tiene su prueba en la tarea indicada):

1. **Aviso del DHN con redacción nueva** → el parser lo rechaza (no inventa), el job conserva el último aviso válido con `parseError`, y la página muestra el texto crudo con tope amarillo. Pruebas: Tareas 2 y 4.
2. **Boletín de alerta sin fecha o de otro año** (el real `31-2025-5`) → no debe producir una alerta roja eterna, pero uno reciente sí debe producir alerta. Pruebas: Tareas 3, 4 y 5.
3. **Open-Meteo con nulos o caído** → hora sin dato nunca es verde; playa sin respuesta muestra "no pude obtener el mar". Pruebas: Tareas 5 y 6.
4. **Consultar tarde (p. ej. 17:30)** → "Hoy" no tiene horas; debe decirlo y no mostrar "ninguna playa apta" como si fuera un veredicto del mar. Prueba: Tarea 6 (`horasDelDia`); comprobación manual: Tarea 7.
5. **Playa fuera de los tramos del aviso, aviso vencido o límites de tramo que cambian** (Callao ↔ Chancay) → tope amarillo con nota explícita; La Punta siempre en "hasta Callao". Pruebas: Tarea 5.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `job/html.js` | HTML del portal del DHN → texto y lista de ítems (id, título, texto) |
| `job/tiempo.js` | Fechas civiles y sufijo de Lima |
| `job/parse-aviso.js` | Texto de un aviso de oleaje → validez, tramos y línea de tiempo de niveles |
| `job/parse-tsunami.js` | Texto de un boletín de sismo/tsunami → evento, versión, fecha, riesgo |
| `job/construir-dhn.js` | Páginas → `dhn.json` validado (conserva el último aviso válido si falla el parseo) |
| `job/run.js` | E/S: descarga, lee el `dhn.json` previo, escribe el nuevo |
| `site/js/lugares.js` | Latitud de los límites de tramo del DHN |
| `site/js/score.js` | Semáforo: factores por hora, tramo de cada playa, bloque, mejor playa, tsunami |
| `site/js/mar.js` | Open-Meteo: URLs, combinación por hora, ventana del día |
| `site/js/app.js`, `index.html`, `style.css` | Interfaz |
| `site/config.json` | Umbrales, ventana y playas |
| `scripts/build-site.mjs`, `serve.mjs`, `valores-hoy.mjs` | Armar `_site/`, verlo en local, calibrar |
| `.github/workflows/publicar.yml` | Cron + manual: pruebas → job → commit de `data/dhn.json` → Pages |
| `tests/` | Pruebas y `fixtures/` con HTML real del DHN (ya existen) |

---

### Tarea 1: Base del repo y utilidades de HTML y fechas

**Archivos:**
- Crear: `package.json`, `.gitignore`, `job/tiempo.js`, `job/html.js`, `tests/html.test.js`
- Ya existen (se commitean aquí): `tests/fixtures/avisos-oleaje.html` (avisos reales 39-26 y 38-26), `tests/fixtures/tsunami.html` (boletines reales 28-2026-2 y 28-2026-1), `tests/fixtures/tsunami-alerta-2025.html` (boletín real 31-2025-5), `tests/fixtures/aviso-redaccion-nueva.html` (sintético: aviso 40-26 con redacción que el parser no entiende), `tests/fixtures/tsunami-alerta.html` (sintético: boletín 29-2026-1 con conclusión de alerta)

**Interfaces:**
- Produce: `htmlATexto(html: string): string`; `separarItems(html: string): Array<{id: string|null, titulo: string, texto: string}>`; de `tiempo.js`: `MESES`, `DIAS_SEMANA`, `quitarTildes(s)`, `fechaIso(y,m,d)`, `sumarDias(iso,n)`, `diaSemana(iso)`, `instanteLima(iso,hora)`.

- [ ] **Paso 1: Verificar el entorno y la rama**

```bash
cd "D:/Desarrollo/Boletin Olas"
node -v          # debe ser v22 o superior
git status -sb   # rama main, con tests/fixtures/ sin commitear
ls tests/fixtures
```

Esperado: Node ≥ 22; la carpeta lista los 5 archivos `.html` de arriba. Si falta alguno, detente y avisa.

- [ ] **Paso 2: Crear `package.json`**

````json
{
  "name": "boletin-olas",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "¿Es buen día para remar en mar calmo en Lima sur y Callao?",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test",
    "dhn": "node job/run.js",
    "build": "node scripts/build-site.mjs",
    "serve": "node scripts/serve.mjs",
    "valores": "node scripts/valores-hoy.mjs"
  }
}
````

- [ ] **Paso 3: Crear `.gitignore`**

````gitignore
_site/
node_modules/
.DS_Store
oleaje_lima_dhn.html
````

(El último renglón excluye el prototipo original, que queda reemplazado por esta app.)

- [ ] **Paso 4: Escribir la prueba que falla**

Crear `tests/html.test.js`:

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlATexto, separarItems } from '../job/html.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('htmlATexto convierte <br> en saltos y quita etiquetas y entidades', () => {
  assert.equal(htmlATexto('<div>a&nbsp;b<br />c &amp; d</div>'), 'a b\nc & d');
});

test('separarItems lee id, título y texto de cada aviso', () => {
  const items = separarItems(leer('avisos-oleaje.html'));
  assert.equal(items.length, 2);
  assert.equal(items[0].id, '5340');
  assert.equal(items[0].titulo, 'AVISO ESPECIAL DE OLEAJE NRO. 39-26 (Válido del 08 al 12 de octubre del 2026)');
  assert.match(items[0].texto, /Litoral Norte \(Zona de Tumbes hasta Salaverry\)/);
});
````

- [ ] **Paso 5: Ejecutar y ver que falla**

Ejecutar: `node --test tests/html.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND` (no existe `job/html.js`).

- [ ] **Paso 6: Implementar `job/tiempo.js` y `job/html.js`**

`job/tiempo.js`:

````js
// Fechas en hora de Lima (UTC-5, sin horario de verano).

export const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const pad = (n) => String(n).padStart(2, '0');

export const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// 'YYYY-MM-DD' (fecha civil, sin zona).
export function fechaIso(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return fechaIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

export function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 'YYYY-MM-DDTHH:00:00-05:00'
export function instanteLima(iso, hora) {
  return `${iso}T${pad(hora)}:00:00-05:00`;
}
````

`job/html.js`:

````js
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
````

- [ ] **Paso 7: Ejecutar y ver que pasa**

Ejecutar: `node --test tests/html.test.js`
Esperado: `pass 2`, `fail 0`.

- [ ] **Paso 8: Commit**

```bash
git add package.json .gitignore job tests
git commit -m "feat: base del repo, utilidades de HTML y fechas, fixtures reales del DHN"
```

---

### Tarea 2: Parser del aviso de oleaje

**Archivos:**
- Crear: `job/parse-aviso.js`, `tests/parse-aviso.test.js`

**Interfaces:**
- Consume: `separarItems` (Tarea 1); `MESES, DIAS_SEMANA, quitarTildes, fechaIso, sumarDias, diaSemana, instanteLima` de `job/tiempo.js`.
- Produce: `parseAviso({titulo, texto, id?}): Aviso` con
  `Aviso = { numero: '39-26', emitidoEn: 'YYYY-MM-DD', validoDesde, validoHasta, url, tramos: Tramo[], faseLunar: string|null, textoCrudo }`,
  `Tramo = { nombre, desde: string, hasta: string, desdeExclusivo: boolean, linea: Array<{nivel: 'ligero'|'moderado'|'fuerte'|'muy fuerte', desde: 'YYYY-MM-DDTHH:00:00-05:00'}> }`
  (`desde`/`hasta` en minúsculas y sin tildes, p. ej. `'san juan de marcona'`; `desdeExclusivo` es `true` cuando el aviso dice "al sur de X");
  `parsearLinea(clausula: string, emision: 'YYYY-MM-DD'): línea|null`; `class AvisoNoEntendido extends Error`.
- Reglas de horas: madrugada 00:00, mañana 06:00, tarde 12:00, noche 18:00; sin parte del día ⇒ 00:00. "Del mismo día" repite la fecha previa de la cláusula. El primer nivel sin momento de inicio ("Persistencia de oleaje ligero…") parte en la fecha de emisión a las 00:00. Cualquier otro nivel sin momento, día imposible o línea desordenada ⇒ `AvisoNoEntendido`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/parse-aviso.test.js`:

````js
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
````

- [ ] **Paso 2: Ejecutar y ver que falla**

Ejecutar: `node --test tests/parse-aviso.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND` (no existe `job/parse-aviso.js`).

- [ ] **Paso 3: Implementar `job/parse-aviso.js`**

````js
import { MESES, DIAS_SEMANA, quitarTildes, fechaIso, sumarDias, diaSemana, instanteLima } from './tiempo.js';

const HORA_PARTE = { madrugada: 0, manana: 6, tarde: 12, noche: 18 };

export class AvisoNoEntendido extends Error {}

const sinTildes = (s) => quitarTildes(s).toLowerCase();

function leerValidez(titulo) {
  const t = sinTildes(titulo);
  const m = t.match(/valido del (\d{1,2})(?: de ([a-z]+))? al (\d{1,2}) de ([a-z]+) del? (\d{4})/);
  if (!m) throw new AvisoNoEntendido(`No entiendo la validez del título: "${titulo}"`);
  const [, d1, mes1, d2, mes2, anio] = m;
  const m2 = MESES[mes2];
  const m1 = mes1 ? MESES[mes1] : m2;
  if (!m1 || !m2) throw new AvisoNoEntendido(`Mes desconocido en "${titulo}"`);
  return { validoDesde: fechaIso(anio, m1, d1), validoHasta: fechaIso(anio, m2, d2) };
}

function leerEmision(texto, validoDesde) {
  const m = sinTildes(texto).match(/callao,\s*(\d{1,2}) de ([a-z]+)\s*(?:del? )?(\d{4})/);
  if (!m || !MESES[m[2]]) return validoDesde;
  return fechaIso(m[3], MESES[m[2]], m[1]);
}

// Busca la fecha civil cuyo día (y día de semana, si viene) coincide, cerca de la emisión.
function resolverDia(dia, semana, emision) {
  for (let i = -2; i <= 14; i++) {
    const f = sumarDias(emision, i);
    if (Number(f.slice(8)) !== dia) continue;
    if (semana !== null && DIAS_SEMANA[diaSemana(f)] !== semana) continue;
    return f;
  }
  throw new AvisoNoEntendido(`No ubico el día ${dia} cerca de ${emision}`);
}

const RE_NIVEL = /\b(muy fuerte|ligero|moderado|fuerte)\b/g;
const RE_INICIO =
  /desde (?:la |el )?(madrugada|manana|tarde|noche)?(?: del?)?\s*(?:(lunes|martes|miercoles|jueves|viernes|sabado|domingo) )?(?:(\d{1,2})|(mismo dia))?/;

// "Persistencia de oleaje ligero ... incrementando a moderado desde la noche del mismo día y
// decreciendo a ligero desde la tarde del viernes 09 de octubre" -> línea de tiempo de niveles.
// Devuelve null si la cláusula no menciona niveles de oleaje.
export function parsearLinea(clausula, emision) {
  const t = sinTildes(clausula);
  const marcas = [...t.matchAll(RE_NIVEL)];
  if (marcas.length === 0) return null;
  const linea = [];
  let fechaPrevia = null;
  marcas.forEach((marca, i) => {
    const segmento = t.slice(marca.index + marca[0].length, marcas[i + 1]?.index ?? t.length);
    const m = segmento.match(RE_INICIO);
    let fecha;
    let hora = 0;
    if (!m) {
      if (i > 0) throw new AvisoNoEntendido(`Nivel "${marca[0]}" sin momento de inicio: "${clausula}"`);
      fecha = emision; // "Persistencia de oleaje ligero": ya presente al emitirse el aviso
    } else {
      if (m[1]) hora = HORA_PARTE[m[1]];
      if (m[3]) fecha = resolverDia(Number(m[3]), m[2] ?? null, emision);
      else fecha = fechaPrevia ?? emision; // "del mismo día" o solo "desde la tarde"
    }
    fechaPrevia = fecha;
    const desde = instanteLima(fecha, hora);
    if (linea.length && desde < linea[linea.length - 1].desde) {
      throw new AvisoNoEntendido(`Línea de tiempo desordenada: "${clausula}"`);
    }
    linea.push({ nivel: marca[0], desde });
  });
  return linea;
}

function leerLimites(etiqueta) {
  const t = sinTildes(etiqueta)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^litoral \w+ \(?zona /, '')
    .replace(/^\(?zona /, '');
  const m = t.match(/^(al sur de |de )?([a-z ]+?) hasta ([a-z ]+?)\)?$/);
  if (!m) throw new AvisoNoEntendido(`No entiendo el tramo: "${etiqueta}"`);
  return { desde: m[2].trim(), hasta: m[3].trim(), desdeExclusivo: m[1] === 'al sur de ' };
}

export function parseAviso({ titulo, texto, id = null }) {
  const numero = (titulo.match(/NRO\.\s*(\d+-\d+)/i) || [])[1];
  if (!numero) throw new AvisoNoEntendido(`Sin número de aviso en "${titulo}"`);
  const { validoDesde, validoHasta } = leerValidez(titulo);
  const emitidoEn = leerEmision(texto, validoDesde);

  const tramos = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*(?:[a-c]\)|[?•·*-])\s*(.+?):\s*(.*)$/i);
    if (!m) continue;
    const niveles = parsearLinea(m[2], emitidoEn);
    if (!niveles) continue; // encabezado sin niveles (p. ej. "Litoral Centro (...):")
    const limites = leerLimites(m[1]);
    tramos.push({ nombre: m[1].trim(), ...limites, linea: niveles });
  }
  if (tramos.length === 0) throw new AvisoNoEntendido('No encontré ningún tramo con niveles de oleaje');

  const luna = texto.match(/fase lunar de ([^,.]+?)(?: orbitando|[,.])/i);
  return {
    numero,
    emitidoEn,
    validoDesde,
    validoHasta,
    url: id
      ? `https://www.dhn.mil.pe/portal/avisos-especiales/${id}`
      : 'https://www.dhn.mil.pe/portal/avisos-especiales',
    tramos,
    faseLunar: luna ? luna[1].trim() : null,
    textoCrudo: texto,
  };
}
````

- [ ] **Paso 4: Ejecutar y ver que pasa**

Ejecutar: `node --test tests/parse-aviso.test.js`
Esperado: `pass 9`, `fail 0`. Si una prueba contra los fixtures reales falla, **no cambies el fixture**: ajusta el parser.

- [ ] **Paso 5: Commit**

```bash
git add job/parse-aviso.js tests/parse-aviso.test.js
git commit -m "feat(job): parser del aviso de oleaje del DHN"
```

---

### Tarea 3: Parser de boletines de sismo/tsunami

**Archivos:**
- Crear: `job/parse-tsunami.js`, `tests/parse-tsunami.test.js`

**Interfaces:**
- Consume: `separarItems` (Tarea 1); `MESES, quitarTildes, fechaIso` de `job/tiempo.js`.
- Produce: `parseTsunami({titulo, texto}): Boletin` con
  `Boletin = { numero: '28-2026-2', evento: '28-2026', version: 2, fechaLocal: 'YYYY-MM-DDTHH:MM:00-05:00'|null, lugar: string|null, magnitud: number|null, generaTsunamiEnPeru: boolean, textoCrudo }`;
  `class BoletinNoEntendido extends Error` (título sin número).
- `generaTsunamiEnPeru` es `false` **solo** si el texto contiene "no genera tsunami en litoral peruano" (sin distinguir mayúsculas ni tildes); en cualquier otro caso es `true`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/parse-tsunami.test.js`:

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseTsunami } from '../job/parse-tsunami.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');

test('boletín de sismo sin riesgo (28-2026-2)', () => {
  const [b] = separarItems(leer('tsunami.html')).map(parseTsunami);
  assert.equal(b.numero, '28-2026-2');
  assert.equal(b.evento, '28-2026');
  assert.equal(b.version, 2);
  assert.equal(b.fechaLocal, '2026-10-09T12:56:00-05:00');
  assert.equal(b.magnitud, 7.6);
  assert.equal(b.lugar, '59 KM WSW OF LAS TABLAS, PANAMA');
  assert.equal(b.generaTsunamiEnPeru, false);
});

test('boletín de vigilancia (28-2026-1) no declara "no genera tsunami"', () => {
  const b = separarItems(leer('tsunami.html')).map(parseTsunami)[1];
  assert.equal(b.version, 1);
  assert.equal(b.lugar, '59 KM WSW OF LAS TABLAS, PANAMA', 'quita ", en tierra"');
  assert.equal(b.generaTsunamiEnPeru, true);
});

test('boletín de alerta real de 2025 (otro formato, sin fecha) cuenta como riesgo', () => {
  const b = parseTsunami(separarItems(leer('tsunami-alerta-2025.html'))[0]);
  assert.equal(b.numero, '31-2025-5');
  assert.equal(b.fechaLocal, null);
  assert.equal(b.generaTsunamiEnPeru, true);
});

test('boletín sin número en el título se rechaza', () => {
  assert.throws(() => parseTsunami({ titulo: 'BOLETÍN RARO', texto: 'x' }), /Sin número/);
});
````

- [ ] **Paso 2: Ejecutar y ver que falla**

Ejecutar: `node --test tests/parse-tsunami.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND`.

- [ ] **Paso 3: Implementar `job/parse-tsunami.js`**

````js
import { MESES, quitarTildes, fechaIso } from './tiempo.js';

export class BoletinNoEntendido extends Error {}

const FRASE_SIN_RIESGO = 'no genera tsunami en litoral peruano';

// "BOLETÍN DE SISMO TSUNAMI N° 28-2026-2" -> { evento: '28-2026', version: 2 }
function leerNumero(titulo) {
  const m = titulo.match(/N[°º]\s*(\d+-\d{4})-(\d+)/i);
  if (!m) throw new BoletinNoEntendido(`Sin número de boletín en "${titulo}"`);
  return { numero: `${m[1]}-${m[2]}`, evento: m[1], version: Number(m[2]) };
}

// Un texto que no entendemos se considera alerta (mejor falso positivo que falso negativo):
// generaTsunamiEnPeru es true siempre que falte la frase explícita de "no genera tsunami".
export function parseTsunami({ titulo, texto }) {
  const { numero, evento, version } = leerNumero(titulo);
  const plano = quitarTildes(texto).toLowerCase().replace(/\s+/g, ' ');

  const f = plano.match(/el dia (\d{1,2}) (?:de )?([a-z]+) (?:de )?(\d{4}), a (\d{1,2}):(\d{2}):\d{2} hora local/);
  const fechaLocal = f && MESES[f[2]]
    ? `${fechaIso(f[3], MESES[f[2]], f[1])}T${f[4].padStart(2, '0')}:${f[5]}:00-05:00`
    : null;

  const lugar = texto.match(/localizado (.+?)(?:, en tierra)?, con una magnitud/i);
  const magnitud = plano.match(/magnitud de ([\d.,]+) mw/);

  return {
    numero,
    evento,
    version,
    fechaLocal,
    lugar: lugar ? lugar[1].trim() : null,
    magnitud: magnitud ? Number(magnitud[1].replace(',', '.')) : null,
    generaTsunamiEnPeru: !plano.includes(FRASE_SIN_RIESGO),
    textoCrudo: texto,
  };
}
````

- [ ] **Paso 4: Ejecutar y ver que pasa**

Ejecutar: `node --test tests/parse-tsunami.test.js`
Esperado: `pass 4`, `fail 0`.

- [ ] **Paso 5: Commit**

```bash
git add job/parse-tsunami.js tests/parse-tsunami.test.js
git commit -m "feat(job): parser de boletines de sismo/tsunami del DHN"
```

---

### Tarea 4: Construcción de `dhn.json` y ejecución del job

**Archivos:**
- Crear: `job/construir-dhn.js`, `job/run.js`, `tests/construir-dhn.test.js`

**Interfaces:**
- Consume: `separarItems`; `parseAviso`, `AvisoNoEntendido`; `parseTsunami`, `BoletinNoEntendido`.
- Produce: `construirDhn({htmlAvisos, htmlTsunami, previo?, ahora: Date}): Dhn` y `validarDhn(d): void` (lanza si es inválido), con
  `Dhn = { generadoEn: ISO, parseError: boolean, aviso: Aviso|null, avisoCrudo: {titulo, texto, url, motivo}|null, tsunami: Array<Boletin & {vistoEn: ISO}> }`.
- Reglas: se elige el aviso de oleaje de mayor número (año·1000 + número). Si no se entiende ⇒ `parseError: true`, `aviso` = el del `previo` (o `null`) y `avisoCrudo` con el texto. Sin ningún aviso de oleaje en la página ⇒ lanza `Error` (no se publica basura). Boletines: se conservan 72 h desde `fechaLocal ?? vistoEn`; sin fecha y de un año distinto al actual ⇒ se descartan; `vistoEn` se arrastra del `previo` por número de boletín.
- `job/run.js` es la capa de E/S: descarga ambas páginas (UTF-8, timeout de 60 s), lee `data/dhn.json` previo, escribe el nuevo **siempre**, y sale con código 1 sin escribir si algo falla.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/construir-dhn.test.js`:

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { construirDhn, validarDhn } from '../job/construir-dhn.js';

const FX = new URL('./fixtures/', import.meta.url);
const leer = (n) => fs.readFileSync(new URL(n, FX), 'utf8');
const ahora = new Date('2026-10-09T15:00:00Z');

test('construirDhn con páginas reales: aviso 39, sin parseError, boletines de sismo', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora });
  assert.equal(d.aviso.numero, '39-26');
  assert.equal(d.parseError, false);
  assert.equal(d.tsunami.length, 2);
  assert.equal(d.generadoEn, '2026-10-09T15:00:00.000Z');
  validarDhn(d);
});

test('construirDhn: aviso ilegible conserva el último válido y marca parseError', () => {
  const previo = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora });
  const d = construirDhn({
    htmlAvisos: leer('aviso-redaccion-nueva.html'), htmlTsunami: leer('tsunami.html'), previo, ahora,
  });
  assert.equal(d.parseError, true);
  assert.equal(d.aviso.numero, '39-26');
  assert.match(d.avisoCrudo.titulo, /NRO\. 40-26/);
  assert.ok(d.avisoCrudo.texto.length > 20);
  assert.ok(d.avisoCrudo.motivo);
});

test('construirDhn: aviso ilegible sin previo -> aviso null pero válido', () => {
  const d = construirDhn({ htmlAvisos: leer('aviso-redaccion-nueva.html'), htmlTsunami: leer('tsunami.html'), ahora });
  assert.equal(d.aviso, null);
  assert.equal(d.parseError, true);
});

test('construirDhn: página sin avisos de oleaje falla (no publica basura)', () => {
  assert.throws(() => construirDhn({ htmlAvisos: '<html></html>', htmlTsunami: leer('tsunami.html'), ahora }), /ningún aviso/);
});

test('construirDhn: boletín de alerta se marca como riesgo', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami-alerta.html'), ahora });
  assert.equal(d.tsunami[0].generaTsunamiEnPeru, true);
});

test('construirDhn: boletines de hace más de 72 h se descartan', () => {
  const tarde = new Date('2026-10-20T15:00:00Z');
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami.html'), ahora: tarde });
  assert.equal(d.tsunami.length, 0);
});

test('validarDhn rechaza JSON roto', () => {
  assert.throws(() => validarDhn({ generadoEn: 'x', parseError: false, aviso: null, tsunami: [] }), /generadoEn/);
  assert.throws(() => validarDhn({ generadoEn: '2026-10-09T00:00:00Z', parseError: false, aviso: null, tsunami: [] }), /sin aviso/);
});

const marJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wave_height: [0.7, null], wave_period: [9.1, 9.0] } };
const vientoJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wind_speed_10m: [5, 9], wind_direction_10m: [200, 210] } };

test('construirDhn: boletín de alerta de 2025 sin fecha no genera alerta en 2026', () => {
  const d = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: leer('tsunami-alerta-2025.html'), ahora });
  assert.equal(d.tsunami.length, 0);
});

test('construirDhn: boletín de alerta sin fecha del año en curso se conserva 72 h desde que se vio', () => {
  const html = leer('tsunami-alerta-2025.html').replace('31-2025-5', '31-2026-5');
  const d1 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, ahora });
  assert.equal(d1.tsunami.length, 1);
  assert.equal(d1.tsunami[0].generaTsunamiEnPeru, true);
  assert.equal(d1.tsunami[0].fechaLocal, null);
  assert.equal(d1.tsunami[0].vistoEn, ahora.toISOString());
  // 2 días después sigue; conserva el vistoEn original
  const dos = new Date('2026-10-11T15:00:00Z');
  const d2 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, previo: d1, ahora: dos });
  assert.equal(d2.tsunami[0].vistoEn, ahora.toISOString());
  // 4 días después ya no
  const cuatro = new Date('2026-10-13T16:00:00Z');
  const d3 = construirDhn({ htmlAvisos: leer('avisos-oleaje.html'), htmlTsunami: html, previo: d1, ahora: cuatro });
  assert.equal(d3.tsunami.length, 0);
});
````

- [ ] **Paso 2: Ejecutar y ver que falla**

Ejecutar: `node --test tests/construir-dhn.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND`.

- [ ] **Paso 3: Implementar `job/construir-dhn.js`**

````js
import { separarItems } from './html.js';
import { parseAviso, AvisoNoEntendido } from './parse-aviso.js';
import { parseTsunami, BoletinNoEntendido } from './parse-tsunami.js';

const VENTANA_TSUNAMI_MS = 72 * 3600 * 1000;
const MAX_TSUNAMI = 10;

function numeroAviso(titulo) {
  const m = titulo.match(/NRO\.\s*(\d+)-(\d+)/i);
  return m ? Number(m[2]) * 1000 + Number(m[1]) : -1; // año*1000 + número
}

// htmlAvisos / htmlTsunami: HTML de las páginas del portal. previo: dhn.json anterior o null.
export function construirDhn({ htmlAvisos, htmlTsunami, previo = null, ahora }) {
  const oleaje = separarItems(htmlAvisos)
    .filter((i) => /AVISO ESPECIAL DE OLEAJE/i.test(i.titulo))
    .sort((a, b) => numeroAviso(b.titulo) - numeroAviso(a.titulo));
  if (oleaje.length === 0) throw new Error('La página de avisos no trae ningún aviso de oleaje');

  let aviso = null;
  let avisoCrudo = null;
  let parseError = false;
  try {
    aviso = parseAviso(oleaje[0]);
  } catch (e) {
    if (!(e instanceof AvisoNoEntendido)) throw e;
    parseError = true;
    aviso = previo?.aviso ?? null; // último aviso que sí entendimos
    avisoCrudo = {
      titulo: oleaje[0].titulo,
      texto: oleaje[0].texto,
      url: oleaje[0].id
        ? `https://www.dhn.mil.pe/portal/avisos-especiales/${oleaje[0].id}`
        : 'https://www.dhn.mil.pe/portal/avisos-especiales',
      motivo: e.message,
    };
  }

  // Algunos boletines (p. ej. los de alerta) no traen "El día ... hora local": sin fechaLocal,
  // la vigencia se mide desde que el job los vio por primera vez (vistoEn).
  const vistos = new Map((previo?.tsunami ?? []).map((b) => [b.numero, b.vistoEn]));
  const anioActual = new Date(ahora.getTime() - 5 * 3600 * 1000).getUTCFullYear();
  const tsunami = separarItems(htmlTsunami)
    .filter((i) => /SISMO TSUNAMI/i.test(i.titulo))
    .map((i) => {
      let b;
      try {
        b = parseTsunami(i);
      } catch (e) {
        if (!(e instanceof BoletinNoEntendido)) throw e;
        // Un boletín ilegible se trata como alerta.
        b = {
          numero: i.titulo, evento: null, version: 0, fechaLocal: null, lugar: null,
          magnitud: null, generaTsunamiEnPeru: true, textoCrudo: i.texto,
        };
      }
      return { ...b, vistoEn: vistos.get(b.numero) ?? ahora.toISOString() };
    })
    .filter((b) => {
      const anioEvento = Number(b.evento?.split('-')[1]);
      if (!b.fechaLocal && anioEvento && anioEvento !== anioActual) return false; // sin fecha y de otro año
      return ahora.getTime() - Date.parse(b.fechaLocal ?? b.vistoEn) <= VENTANA_TSUNAMI_MS;
    })
    .slice(0, MAX_TSUNAMI);

  const dhn = { generadoEn: ahora.toISOString(), parseError, aviso, avisoCrudo, tsunami };
  validarDhn(dhn);
  return dhn;
}

export function validarDhn(d) {
  const falla = (m) => {
    throw new Error(`dhn.json inválido: ${m}`);
  };
  if (!d || typeof d !== 'object') falla('no es un objeto');
  if (Number.isNaN(Date.parse(d.generadoEn))) falla('generadoEn');
  if (typeof d.parseError !== 'boolean') falla('parseError');
  if (d.aviso) {
    if (!/^\d+-\d+$/.test(d.aviso.numero)) falla('aviso.numero');
    if (!Array.isArray(d.aviso.tramos) || d.aviso.tramos.length === 0) falla('aviso.tramos');
    for (const t of d.aviso.tramos) {
      if (!t.desde || !t.hasta || typeof t.desdeExclusivo !== 'boolean') falla(`tramo ${t.nombre}`);
      if (!Array.isArray(t.linea) || t.linea.length === 0) falla(`linea de ${t.nombre}`);
      for (const p of t.linea) {
        if (!['ligero', 'moderado', 'fuerte', 'muy fuerte'].includes(p.nivel)) falla(`nivel ${p.nivel}`);
        if (Number.isNaN(Date.parse(p.desde))) falla(`desde ${p.desde}`);
      }
    }
  } else if (!d.parseError) {
    falla('sin aviso y sin parseError');
  }
  if (!Array.isArray(d.tsunami)) falla('tsunami');
}
````

- [ ] **Paso 4: Ejecutar y ver que pasa**

Ejecutar: `node --test tests/construir-dhn.test.js`
Esperado: `pass 9`, `fail 0`.

- [ ] **Paso 5: Implementar `job/run.js`**

````js
// Descarga el aviso de oleaje y los boletines de sismo/tsunami del DHN y escribe data/dhn.json.
// Uso: node job/run.js   (lo ejecuta GitHub Actions; también sirve a mano)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirDhn } from './construir-dhn.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'data', 'dhn.json');
const URL_AVISOS = 'https://www.dhn.mil.pe/portal/avisos-especiales';
const URL_TSUNAMI = 'https://www.dhn.mil.pe/portal/boletin-sismo-tsunami';

async function bajar(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoletinOlas/1.0)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return new TextDecoder('utf-8').decode(await r.arrayBuffer());
}

async function principal() {
  const [htmlAvisos, htmlTsunami] = await Promise.all([bajar(URL_AVISOS), bajar(URL_TSUNAMI)]);
  const previo = fs.existsSync(DESTINO) ? JSON.parse(fs.readFileSync(DESTINO, 'utf8')) : null;
  const dhn = construirDhn({ htmlAvisos, htmlTsunami, previo, ahora: new Date() });
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, `${JSON.stringify(dhn, null, 2)}\n`);
  console.log(
    `dhn.json escrito: aviso ${dhn.aviso?.numero ?? 'ninguno'}, parseError=${dhn.parseError}, ${dhn.tsunami.length} boletín(es) de sismo`,
  );
  if (dhn.parseError) console.warn(`Aviso no entendido: ${dhn.avisoCrudo.motivo}`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1); // sin escribir: se conserva el dhn.json anterior y Actions avisa por correo
});
````

- [ ] **Paso 6: Probar el job contra el DHN real**

Ejecutar: `npm run dhn`
Esperado: una línea del estilo `dhn.json escrito: aviso 39-26, parseError=false, N boletín(es) de sismo` (el número de aviso será el vigente ese día). Abre `data/dhn.json` y comprueba que `aviso.tramos` tiene 4 tramos con `linea` no vacía. Si sale `parseError=true`, **eso es información valiosa**: el DHN cambió su redacción; copia `avisoCrudo.texto` a un fixture nuevo, añade una prueba y ajusta el parser antes de seguir.

- [ ] **Paso 7: Commit**

```bash
git add job tests
git commit -m "feat(job): construir y escribir dhn.json con fallback al último aviso válido"
```

(`data/dhn.json` no se commitea aquí; lo hace el workflow.)

---

### Tarea 5: Scorer del semáforo, tramos y tsunami

**Archivos:**
- Crear: `site/js/lugares.js`, `site/config.json`, `site/js/score.js`, `tests/score.test.js`

**Interfaces:**
- Consume: `Aviso`/`Tramo`/`Dhn`/`Boletin` de las tareas 2–4 (las pruebas usan los fixtures reales).
- Produce (todas exportadas desde `site/js/score.js`):
  - `colorAltura(hs, u)`, `colorPeriodo(tp, hs, u)`, `colorViento(kmh, dirViento, u)`, `colorDhn(nivel|null)` → `{color: 'verde'|'amarillo'|'rojo', texto}`; `esTerral(dir, u)`; `peor(a, b)`.
  - `tramoParaPlaya(playa, aviso|null): Tramo|null` — usa `playa.latTramo ?? playa.lat` y `LUGARES`; "hasta X" es inclusivo y "al sur de X" exclusivo; gana el tramo más angosto; límites desconocidos ⇒ se ignora el tramo.
  - `nivelEn(tramo, aviso, instante): nivel|null` — `'normal'` antes del primer punto; `null` después del fin de validez.
  - `estadoDhn(dhn|null, ahoraMs, u): 'ok'|'ausente'|'obsoleto'|'errorParseo'` (obsoleto si `generadoEn` tiene más de `u.horasMaxDhn` horas).
  - `evaluarHora(dato, {umbrales, nivelDhn, estado, tsunamiAlerta}): {hora, color, razones: Array<{factor, color, texto}>, dato}`.
  - `evaluarPlayaDia({playa, horasCrudas, aviso, dhn, ahoraMs, config, tsunamiAlerta?}): {playa, horas, bloque: {desde, hasta, color}|null, color, motivo, notas: string[], tramo: string|null}` — `horasCrudas` = `[{hora: 'YYYY-MM-DDTHH:00', hs, tp, vientoKmh, dirViento}]`; el bloque es la racha más larga de horas verdes (mínimo `bloqueMinHoras`), o si no hay, la de horas no rojas; `hasta` = última hora + 1.
  - `mejorPlaya(resultados): resultado|null` — prefiere verde, luego el bloque más largo, luego el más temprano.
  - `evaluarTsunami(boletines, ahoraMs): {estado: 'alerta'|'informativo'|'ninguno', boletin}` — por evento vale la mayor `version`; vigencia 24 h desde `fechaLocal ?? vistoEn`; sin ninguna de las dos cuenta como reciente.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/score.test.js`:

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { separarItems } from '../job/html.js';
import { parseAviso } from '../job/parse-aviso.js';
import { parseTsunami } from '../job/parse-tsunami.js';
import {
  colorAltura, colorPeriodo, colorViento, colorDhn, tramoParaPlaya, nivelEn, estadoDhn,
  evaluarHora, evaluarPlayaDia, mejorPlaya, evaluarTsunami,
} from '../site/js/score.js';

const FX = new URL('./fixtures/', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
const u = config.umbrales;
const playa = (id) => config.playas.find((p) => p.id === id);
const aviso39 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[0]);

test('altura: límites exactos', () => {
  assert.equal(colorAltura(0.8, u).color, 'verde');
  assert.equal(colorAltura(0.81, u).color, 'amarillo');
  assert.equal(colorAltura(1.3, u).color, 'amarillo');
  assert.equal(colorAltura(1.31, u).color, 'rojo');
});

test('periodo: largo solo importa si hay olas', () => {
  assert.equal(colorPeriodo(18, 0.5, u).color, 'verde');
  assert.equal(colorPeriodo(12, 0.7, u).color, 'verde');
  assert.equal(colorPeriodo(13, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.7, u).color, 'amarillo');
  assert.equal(colorPeriodo(15, 0.9, u).color, 'rojo');
});

test('viento: límites y terral más estricto', () => {
  assert.equal(colorViento(12, 200, u).color, 'verde');
  assert.equal(colorViento(13, 200, u).color, 'amarillo');
  assert.equal(colorViento(21, 200, u).color, 'rojo');
  assert.equal(colorViento(8, 90, u).color, 'verde');
  assert.equal(colorViento(9, 90, u).color, 'amarillo');
  assert.equal(colorViento(16, 90, u).color, 'rojo');
  assert.equal(colorViento(9, 19, u).color, 'verde', '19° ya no es terral, 9 km/h < 12');
  assert.equal(colorViento(9, 20, u).color, 'amarillo', '20° es terral');
  assert.equal(colorViento(9, 160, u).color, 'amarillo', '160° es terral');
  assert.equal(colorViento(9, 161, u).color, 'verde');
});

test('dhn: niveles y desconocido', () => {
  assert.equal(colorDhn('normal').color, 'verde');
  assert.equal(colorDhn('ligero').color, 'verde');
  assert.equal(colorDhn('moderado').color, 'amarillo');
  assert.equal(colorDhn('fuerte').color, 'rojo');
  assert.equal(colorDhn('muy fuerte').color, 'rojo');
  assert.equal(colorDhn(null).color, 'amarillo');
});

test('tramo: La Punta va en "hasta Callao"; las otras tres "al sur de Callao"', () => {
  assert.match(tramoParaPlaya(playa('la-punta'), aviso39).nombre, /Salaverry hasta Callao/);
  for (const id of ['san-bartolo', 'punta-hermosa', 'yuyos']) {
    assert.match(tramoParaPlaya(playa(id), aviso39).nombre, /Callao hasta San Juan de Marcona/);
  }
});

test('tramo: con el aviso 38 (límite en Chancay) todas caen al sur de Chancay', () => {
  const aviso38 = parseAviso(separarItems(fs.readFileSync(new URL('avisos-oleaje.html', FX), 'utf8'))[1]);
  for (const p of config.playas) {
    assert.match(tramoParaPlaya(p, aviso38).nombre, /Chancay hasta San Juan de Marcona/);
  }
});

test('tramo: playa fuera de los tramos conocidos -> null', () => {
  assert.equal(tramoParaPlaya({ lat: -25, lon: -70 }, aviso39), null);
  assert.equal(tramoParaPlaya(playa('yuyos'), null), null);
});

test('nivelEn sigue la línea de tiempo y vence con el aviso', () => {
  const t = tramoParaPlaya(playa('yuyos'), aviso39);
  assert.equal(nivelEn(t, aviso39, '2026-10-06T10:00:00-05:00'), 'normal');
  assert.equal(nivelEn(t, aviso39, '2026-10-07T13:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T11:00:00-05:00'), 'moderado');
  assert.equal(nivelEn(t, aviso39, '2026-10-09T12:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-12T23:00:00-05:00'), 'ligero');
  assert.equal(nivelEn(t, aviso39, '2026-10-13T00:00:00-05:00'), null);
});

test('estadoDhn', () => {
  const ahora = Date.parse('2026-10-09T15:00:00Z');
  assert.equal(estadoDhn(null, ahora, u), 'ausente');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z' }, ahora, u), 'ok');
  assert.equal(estadoDhn({ generadoEn: '2026-10-07T10:31:00Z' }, ahora, u), 'obsoleto');
  assert.equal(estadoDhn({ generadoEn: '2026-10-09T10:31:00Z', parseError: true }, ahora, u), 'errorParseo');
});

test('evaluarHora: el peor factor manda y datos faltantes no dan verde', () => {
  const ctx = { umbrales: u, nivelDhn: 'ligero', estado: 'ok', tsunamiAlerta: false };
  const bueno = { hora: '2026-10-09T07:00', hs: 0.5, tp: 9, vientoKmh: 6, dirViento: 200 };
  assert.equal(evaluarHora(bueno, ctx).color, 'verde');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: 25 }, ctx).color, 'rojo');
  assert.equal(evaluarHora({ ...bueno, hs: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora({ ...bueno, vientoKmh: null }, ctx).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, nivelDhn: 'moderado' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, estado: 'obsoleto' }).color, 'amarillo');
  assert.equal(evaluarHora(bueno, { ...ctx, tsunamiAlerta: true }).color, 'rojo');
});

function dia(valores) {
  return valores.map(([h, hs, tp, v, dir]) => ({
    hora: `2026-10-09T${String(h).padStart(2, '0')}:00`, hs, tp, vientoKmh: v, dirViento: dir,
  }));
}
const dhn = { generadoEn: '2026-10-09T10:31:00Z', parseError: false, aviso: aviso39 };
const ahoraMs = Date.parse('2026-10-09T12:00:00Z');
const evaluar = (id, horasCrudas, extra = {}) =>
  evaluarPlayaDia({ playa: playa(id), horasCrudas, aviso: aviso39, dhn, ahoraMs, config, ...extra });

test('playa-día: bloque verde de la mañana y el viento rompe la tarde', () => {
  const r = evaluar('yuyos', dia([
    [12, 0.5, 9, 5, 200], [13, 0.5, 9, 6, 200], [14, 0.5, 9, 7, 200],
    [15, 0.5, 9, 14, 200], [16, 0.5, 9, 18, 200],
  ]));
  assert.equal(r.color, 'verde');
  assert.deepEqual([r.bloque.desde, r.bloque.hasta], [12, 15]);
  assert.match(r.motivo, /^Verde 12–15 h\. Luego: viento de 14 km\/h/);
});

test('playa-día: una hora verde aislada no cuenta como bloque', () => {
  const r = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 25, 200], [14, 0.5, 9, 5, 200]]));
  assert.equal(r.bloque, null);
  assert.equal(r.color, 'rojo');
  assert.match(r.motivo, /^No apto/);
});

test('playa-día: sin verde de 2 h pero con amarillo contiguo -> amarillo', () => {
  const r = evaluar('yuyos', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200]]));
  assert.equal(r.color, 'amarillo');
  assert.equal(r.bloque.hasta - r.bloque.desde, 3);
});

test('playa-día: día sin datos', () => {
  const r = evaluar('yuyos', []);
  assert.equal(r.color, 'rojo');
  assert.equal(r.motivo, 'Sin datos para este día');
});

test('playa-día: el DHN moderado limita a amarillo aunque el mar esté plano', () => {
  const r = evaluar('yuyos', dia([[8, 0.4, 8, 3, 200], [9, 0.4, 8, 3, 200]]).map((h) => ({ ...h, hora: h.hora.replace('10-09', '10-08') })));
  assert.equal(r.color, 'amarillo', 'el 8/10 el tramo está en moderado');
});

test('playa-día: tsunami fuerza rojo', () => {
  const r = evaluar('yuyos', dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]), { tsunamiAlerta: true });
  assert.equal(r.color, 'rojo');
});

test('playa-día: sin aviso DHN -> tope amarillo y nota', () => {
  const r = evaluarPlayaDia({
    playa: playa('yuyos'), horasCrudas: dia([[12, 0.4, 8, 3, 200], [13, 0.4, 8, 3, 200]]),
    aviso: null, dhn: null, ahoraMs, config,
  });
  assert.equal(r.color, 'amarillo');
  assert.ok(r.notas.length > 0);
});

test('mejorPlaya prefiere verde y luego bloque más largo', () => {
  const a = evaluar('yuyos', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200]]));
  const b = evaluar('la-punta', dia([[12, 0.5, 9, 5, 200], [13, 0.5, 9, 5, 200], [14, 0.5, 9, 5, 200]]));
  const c = evaluar('san-bartolo', dia([[12, 0.9, 9, 5, 200], [13, 0.9, 9, 5, 200], [14, 0.9, 9, 5, 200], [15, 0.9, 9, 5, 200]]));
  assert.equal(mejorPlaya([a, b, c]).playa.id, 'la-punta');
  assert.equal(mejorPlaya([c]).playa.id, 'san-bartolo');
  assert.equal(mejorPlaya([evaluar('yuyos', [])]), null);
});

test('tsunami: sin riesgo es informativo; el boletín de mayor versión del evento manda', () => {
  const [b2, b1] = separarItems(fs.readFileSync(new URL('tsunami.html', FX), 'utf8')).map(parseTsunami);
  const ahora = Date.parse('2026-10-09T20:00:00Z');
  assert.equal(b1.generaTsunamiEnPeru, true, 'el -1 solo "intensifica vigilancia"');
  const r = evaluarTsunami([b1, b2], ahora);
  assert.equal(r.estado, 'informativo');
  assert.equal(r.boletin.numero, '28-2026-2');
});

test('tsunami: alerta reciente -> alerta; vieja -> ninguno; texto raro -> alerta', () => {
  const base = { evento: '30-2026', version: 1, fechaLocal: '2026-10-09T10:00:00-05:00', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([base], Date.parse('2026-10-11T20:00:00Z')).estado, 'ninguno');
  assert.equal(evaluarTsunami([{ ...base, fechaLocal: null }], Date.parse('2026-10-11T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([], 0).estado, 'ninguno');
});

test('tsunami: sin fechaLocal vale vistoEn (24 h)', () => {
  const b = { evento: '31-2026', version: 5, fechaLocal: null, vistoEn: '2026-10-09T10:00:00Z', generaTsunamiEnPeru: true };
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-09T20:00:00Z')).estado, 'alerta');
  assert.equal(evaluarTsunami([b], Date.parse('2026-10-10T20:00:00Z')).estado, 'ninguno');
});
````

- [ ] **Paso 2: Ejecutar y ver que falla**

Ejecutar: `node --test tests/score.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND` (no existen `site/js/score.js` ni `site/config.json`).

- [ ] **Paso 3: Crear `site/js/lugares.js`**

````js
// Latitud aproximada (grados, negativa al sur) de los puntos que el DHN usa como límites de tramo.
// Un nombre ausente de esta tabla hace que la playa quede "sin tramo" (tope amarillo con aviso).
export const LUGARES = {
  tumbes: -3.57,
  paita: -5.09,
  salaverry: -8.22,
  chimbote: -9.08,
  supe: -10.8,
  huacho: -11.11,
  chancay: -11.57,
  ancon: -11.77,
  callao: -12.05,
  pucusana: -12.47,
  'cerro azul': -13.03,
  pisco: -13.71,
  'san juan de marcona': -15.35,
  mollendo: -17.02,
  ilo: -17.64,
  tacna: -18.0,
};
````

- [ ] **Paso 4: Crear `site/config.json`**

Los umbrales son los aprobados en el spec. Las coordenadas de las playas son aproximadas (se afinan en la Tarea 9); `La Punta` lleva `latTramo` igual a la latitud de Callao para que caiga en el tramo "hasta Callao".

````json
{
  "umbrales": {
    "altura": { "verde": 0.8, "amarillo": 1.3 },
    "periodo": { "calmoHs": 0.6, "verde": 12, "amarillo": 14, "rojoHs": 0.8 },
    "viento": { "verde": 12, "amarillo": 20 },
    "terral": { "dirDesde": 20, "dirHasta": 160, "verde": 8, "amarillo": 15 },
    "bloqueMinHoras": 2,
    "horasMaxDhn": 36
  },
  "ventana": { "horaInicio": 6, "horaFin": 17 },
  "playas": [
    { "id": "san-bartolo", "nombre": "San Bartolo", "lat": -12.389, "lon": -76.779 },
    { "id": "punta-hermosa", "nombre": "Punta Hermosa", "lat": -12.337, "lon": -76.826 },
    { "id": "yuyos", "nombre": "Yuyos", "lat": -12.37, "lon": -76.797 },
    { "id": "la-punta", "nombre": "La Punta", "lat": -12.071, "lon": -77.164, "latTramo": -12.05 }
  ]
}
````

- [ ] **Paso 5: Implementar `site/js/score.js`**

````js
import { LUGARES } from './lugares.js';

export const VERDE = 'verde';
export const AMARILLO = 'amarillo';
export const ROJO = 'rojo';
const ORDEN = { [VERDE]: 0, [AMARILLO]: 1, [ROJO]: 2 };

export const peor = (a, b) => (ORDEN[a] >= ORDEN[b] ? a : b);

const f1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

// ---------- Factores por hora ----------

export function colorAltura(hs, u) {
  if (hs <= u.altura.verde) return { color: VERDE, texto: `Olas de ${f1(hs)} m` };
  if (hs <= u.altura.amarillo) return { color: AMARILLO, texto: `Olas de ${f1(hs)} m, algo altas` };
  return { color: ROJO, texto: `Olas de ${f1(hs)} m, demasiado altas` };
}

export function colorPeriodo(tp, hs, u) {
  const p = u.periodo;
  if (hs <= p.calmoHs) return { color: VERDE, texto: `Periodo de ${f1(tp)} s` };
  if (tp > p.amarillo && hs > p.rojoHs) {
    return { color: ROJO, texto: `Mar de fondo largo (${f1(tp)} s) con rompiente fuerte en orilla` };
  }
  if (tp > p.verde) return { color: AMARILLO, texto: `Periodo largo (${f1(tp)} s), rompiente en orilla` };
  return { color: VERDE, texto: `Periodo de ${f1(tp)} s` };
}

export function esTerral(dirViento, u) {
  return dirViento >= u.terral.dirDesde && dirViento <= u.terral.dirHasta;
}

export function colorViento(kmh, dirViento, u) {
  const general =
    kmh <= u.viento.verde ? VERDE : kmh <= u.viento.amarillo ? AMARILLO : ROJO;
  let color = general;
  let texto = `Viento de ${Math.round(kmh)} km/h`;
  if (esTerral(dirViento, u)) {
    const t = u.terral;
    const colorTerral = kmh <= t.verde ? VERDE : kmh <= t.amarillo ? AMARILLO : ROJO;
    if (ORDEN[colorTerral] > ORDEN[color]) color = colorTerral;
    if (colorTerral !== VERDE) texto = `Viento terral de ${Math.round(kmh)} km/h (empuja mar adentro)`;
  } else if (general !== VERDE) {
    texto = `Viento de ${Math.round(kmh)} km/h`;
  }
  return { color, texto };
}

const NIVEL_A_COLOR = { normal: VERDE, ligero: VERDE, moderado: AMARILLO, fuerte: ROJO, 'muy fuerte': ROJO };

export function colorDhn(nivel) {
  if (nivel === null || nivel === undefined) {
    return { color: AMARILLO, texto: 'Sin dato del DHN para esta hora' };
  }
  const color = NIVEL_A_COLOR[nivel] ?? AMARILLO;
  return { color, texto: `Oleaje ${nivel} según el DHN` };
}

// ---------- Aviso del DHN: tramo de la playa y nivel en un instante ----------

// Un tramo contiene la playa si queda entre su límite sur ("hasta", inclusivo) y su límite norte
// ("desde", exclusivo cuando dice "al sur de"). Gana el tramo más angosto. null si no hay.
export function tramoParaPlaya(playa, aviso) {
  if (!aviso) return null;
  const lat = playa.latTramo ?? playa.lat;
  let mejor = null;
  let anchoMejor = Infinity;
  for (const tramo of aviso.tramos) {
    const norte = LUGARES[tramo.desde];
    const sur = LUGARES[tramo.hasta];
    if (norte === undefined || sur === undefined) continue;
    const dentroNorte = tramo.desdeExclusivo ? lat < norte : lat <= norte;
    if (dentroNorte && lat >= sur && norte - sur < anchoMejor) {
      mejor = tramo;
      anchoMejor = norte - sur;
    }
  }
  return mejor;
}

// Nivel vigente en `instante` ('YYYY-MM-DDTHH:MM:SS-05:00', comparable como texto).
// null si el aviso ya venció.
export function nivelEn(tramo, aviso, instante) {
  if (instante > `${aviso.validoHasta}T23:59:59-05:00`) return null;
  let nivel = 'normal';
  for (const punto of tramo.linea) {
    if (punto.desde <= instante) nivel = punto.nivel;
  }
  return nivel;
}

// 'ok' | 'ausente' | 'obsoleto' | 'errorParseo'
export function estadoDhn(dhn, ahoraMs, u) {
  if (!dhn) return 'ausente';
  if (ahoraMs - Date.parse(dhn.generadoEn) > u.horasMaxDhn * 3600 * 1000) return 'obsoleto';
  if (dhn.parseError) return 'errorParseo';
  return 'ok';
}

// ---------- Evaluación de una hora ----------

const sinDato = (n) => n === null || n === undefined || Number.isNaN(n);

export function evaluarHora(dato, ctx) {
  const { umbrales: u, nivelDhn, estado, tsunamiAlerta } = ctx;
  const razones = [];
  if (tsunamiAlerta) {
    razones.push({ factor: 'tsunami', color: ROJO, texto: 'Alerta de sismo/tsunami del DHN' });
  }
  if (sinDato(dato.hs) || sinDato(dato.tp)) {
    razones.push({ factor: 'oleaje', color: AMARILLO, texto: 'Sin dato de oleaje para esta hora' });
  } else {
    razones.push({ factor: 'altura', ...colorAltura(dato.hs, u) });
    razones.push({ factor: 'periodo', ...colorPeriodo(dato.tp, dato.hs, u) });
  }
  if (sinDato(dato.vientoKmh) || sinDato(dato.dirViento)) {
    razones.push({ factor: 'viento', color: AMARILLO, texto: 'Sin dato de viento para esta hora' });
  } else {
    razones.push({ factor: 'viento', ...colorViento(dato.vientoKmh, dato.dirViento, u) });
  }
  let dhn = colorDhn(nivelDhn);
  if (estado !== 'ok' && dhn.color === VERDE) {
    dhn = { color: AMARILLO, texto: 'Sin aviso DHN reciente, revisa dhn.mil.pe' };
  }
  razones.push({ factor: 'dhn', ...dhn });
  const color = razones.reduce((c, r) => peor(c, r.color), VERDE);
  return { hora: dato.hora, color, razones, dato };
}

// ---------- Evaluación de una playa en un día ----------

function rachas(horas, aceptable) {
  const salida = [];
  let inicio = null;
  horas.forEach((h, i) => {
    if (aceptable(h)) {
      if (inicio === null) inicio = i;
    } else if (inicio !== null) {
      salida.push([inicio, i - 1]);
      inicio = null;
    }
  });
  if (inicio !== null) salida.push([inicio, horas.length - 1]);
  return salida;
}

const horaDe = (iso) => Number(iso.slice(11, 13));

function mejorRacha(horas, aceptable, minHoras) {
  let mejor = null;
  for (const [a, b] of rachas(horas, aceptable)) {
    if (b - a + 1 < minHoras) continue;
    if (!mejor || b - a > mejor[1] - mejor[0]) mejor = [a, b];
  }
  return mejor;
}

// horasCrudas: [{hora:'2026-10-09T06:00', hs, tp, vientoKmh, dirViento}], ya filtradas a la ventana.
export function evaluarPlayaDia({ playa, horasCrudas, aviso, dhn, ahoraMs, config, tsunamiAlerta = false }) {
  const u = config.umbrales;
  const estado = estadoDhn(dhn, ahoraMs, u);
  const tramo = aviso ? tramoParaPlaya(playa, aviso) : null;
  const notas = [];
  if (estado === 'ausente') notas.push('No hay datos del DHN: el semáforo no puede pasar de amarillo.');
  if (estado === 'obsoleto') notas.push('Los datos del DHN están desactualizados: tope amarillo.');
  if (estado === 'errorParseo') notas.push('No pude leer el último aviso del DHN: tope amarillo, revisa el texto original.');
  if (aviso && !tramo) notas.push('Esta playa no aparece en los tramos del aviso del DHN: tope amarillo.');

  const horas = horasCrudas.map((dato) => {
    let nivelDhn = null;
    if (aviso && tramo) nivelDhn = nivelEn(tramo, aviso, `${dato.hora}:00-05:00`);
    return evaluarHora(dato, { umbrales: u, nivelDhn, estado: aviso && tramo ? estado : 'ausente', tsunamiAlerta });
  });

  const min = u.bloqueMinHoras;
  const verde = mejorRacha(horas, (h) => h.color === VERDE, min);
  const apto = mejorRacha(horas, (h) => h.color !== ROJO, min);
  const rango = verde ?? apto;
  let bloque = null;
  let color = ROJO;
  if (rango) {
    color = verde ? VERDE : AMARILLO;
    bloque = {
      desde: horaDe(horas[rango[0]].hora),
      hasta: horaDe(horas[rango[1]].hora) + 1,
      color,
    };
  }

  let motivo;
  if (bloque) {
    const siguiente = horas[rango[1] + 1];
    motivo = `${color === VERDE ? 'Verde' : 'Amarillo'} ${bloque.desde}–${bloque.hasta} h`;
    if (siguiente && siguiente.color !== VERDE) {
      const r = siguiente.razones.filter((x) => x.color !== VERDE).sort((a, b) => ORDEN[b.color] - ORDEN[a.color])[0];
      motivo += `. Luego: ${r.texto.toLowerCase()}`;
    }
    if (color === AMARILLO) {
      const r = horas[rango[0]].razones.find((x) => x.color === AMARILLO);
      if (r) motivo += `. ${r.texto}`;
    }
  } else if (horas.length === 0) {
    motivo = 'Sin datos para este día';
  } else {
    const menosMala = [...horas].sort((a, b) => ORDEN[a.color] - ORDEN[b.color])[0];
    const r = menosMala.razones.filter((x) => x.color === ROJO)[0] ?? menosMala.razones[0];
    motivo = `No apto: ${r.texto.toLowerCase()}`;
  }

  return { playa, horas, bloque, color, motivo, notas, tramo: tramo?.nombre ?? null };
}

export function mejorPlaya(resultados) {
  const candidatas = resultados.filter((r) => r.bloque);
  candidatas.sort(
    (a, b) =>
      ORDEN[a.color] - ORDEN[b.color] ||
      b.bloque.hasta - b.bloque.desde - (a.bloque.hasta - a.bloque.desde) ||
      a.bloque.desde - b.bloque.desde,
  );
  return candidatas[0] ?? null;
}

// ---------- Tsunami ----------

// Por cada evento (28-2026) vale el boletín de mayor versión. Hay alerta si alguno de esos
// boletines, de las últimas 24 h, no declara "no genera tsunami en el litoral peruano".
export function evaluarTsunami(boletines, ahoraMs) {
  const ultimos = new Map();
  for (const b of boletines ?? []) {
    const clave = b.evento ?? b.numero;
    const previo = ultimos.get(clave);
    if (!previo || b.version > previo.version) ultimos.set(clave, b);
  }
  // Sin fechaLocal vale vistoEn (cuándo lo vio el job); sin ninguna de las dos, cuenta como reciente.
  const referencia = (b) => Date.parse(b.fechaLocal ?? b.vistoEn ?? '') || ahoraMs;
  const recientes = [...ultimos.values()].filter((b) => ahoraMs - referencia(b) <= 24 * 3600 * 1000);
  const alerta = recientes.find((b) => b.generaTsunamiEnPeru);
  if (alerta) return { estado: 'alerta', boletin: alerta };
  if (recientes.length) {
    recientes.sort((a, b) => referencia(b) - referencia(a));
    return { estado: 'informativo', boletin: recientes[0] };
  }
  return { estado: 'ninguno', boletin: null };
}
````

- [ ] **Paso 6: Ejecutar y ver que pasa**

Ejecutar: `node --test tests/score.test.js`
Esperado: `pass 21`, `fail 0`.

- [ ] **Paso 7: Commit**

```bash
git add site tests/score.test.js
git commit -m "feat(site): scorer del semáforo, asignación de tramos y override de tsunami"
```

---

### Tarea 6: Datos de mar y viento (Open-Meteo)

**Archivos:**
- Crear: `site/js/mar.js`, `tests/mar.test.js`

**Interfaces:**
- Consume: nada de otras tareas.
- Produce: `urlMar(playa)`, `urlViento(playa)`; `combinarHoras(marJson, vientoJson): Array<{hora, hs, tp, vientoKmh, dirViento}>` (une por texto de hora, conserva `null`, lanza si falta `hourly.time`); `ahoraLima(ms): 'YYYY-MM-DDTHH:MM'`; `horasDelDia(horas, fecha, {horaInicio, horaFin}, ahoraMs)` (ventana `[horaInicio, horaFin)` y, para el día en curso, descarta horas ya pasadas); `cargarMar(playa, fetchFn = fetch): Promise<horas>` (lanza si HTTP no es ok).

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/mar.test.js`:

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { combinarHoras, horasDelDia, ahoraLima, cargarMar } from '../site/js/mar.js';

const marJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wave_height: [0.7, null], wave_period: [9.1, 9.0] } };
const vientoJson = { hourly: { time: ['2026-10-09T06:00', '2026-10-09T07:00'], wind_speed_10m: [5, 9], wind_direction_10m: [200, 210] } };

test('combinarHoras une por hora y conserva los nulos', () => {
  const h = combinarHoras(marJson, vientoJson);
  assert.deepEqual(h[0], { hora: '2026-10-09T06:00', hs: 0.7, tp: 9.1, vientoKmh: 5, dirViento: 200 });
  assert.equal(h[1].hs, null);
  assert.throws(() => combinarHoras({}, vientoJson), /sin datos horarios/);
});

test('horasDelDia: ventana [6,17) y descarta horas pasadas de hoy', () => {
  const horas = [5, 6, 10, 16, 17].map((n) => ({ hora: `2026-10-09T${String(n).padStart(2, '0')}:00` }));
  const ventana = { horaInicio: 6, horaFin: 17 };
  assert.deepEqual(horasDelDia(horas, '2026-10-09', ventana, Date.parse('2026-10-09T06:00:00Z')).map((h) => h.hora.slice(11, 13)), ['06', '10', '16']);
  // 15:30 UTC = 10:30 Lima: ya pasó la hora 06, la hora 10 sigue vigente
  assert.deepEqual(horasDelDia(horas, '2026-10-09', ventana, Date.parse('2026-10-09T15:30:00Z')).map((h) => h.hora.slice(11, 13)), ['10', '16']);
  assert.equal(ahoraLima(Date.parse('2026-10-09T03:00:00Z')), '2026-10-08T22:00');
});

test('cargarMar: error HTTP lanza', async () => {
  const falso = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => cargarMar({ lat: 0, lon: 0 }, falso), /503/);
});
````

- [ ] **Paso 2: Ejecutar y ver que falla**

Ejecutar: `node --test tests/mar.test.js`
Esperado: FALLA con `ERR_MODULE_NOT_FOUND`.

- [ ] **Paso 3: Implementar `site/js/mar.js`**

````js
// Datos de oleaje y viento por playa desde Open-Meteo (gratuito, sin clave, admite CORS).

const MARINO = 'https://marine-api.open-meteo.com/v1/marine';
const VIENTO = 'https://api.open-meteo.com/v1/forecast';
const COMUN = 'forecast_days=3&timezone=America%2FLima';

export const urlMar = (p) =>
  `${MARINO}?latitude=${p.lat}&longitude=${p.lon}&hourly=wave_height,wave_period&${COMUN}`;
export const urlViento = (p) =>
  `${VIENTO}?latitude=${p.lat}&longitude=${p.lon}&hourly=wind_speed_10m,wind_direction_10m&${COMUN}`;

// Une las dos respuestas por hora ('2026-10-09T07:00', hora de Lima). Devuelve
// [{hora, hs, tp, vientoKmh, dirViento}], con null donde la fuente no trae dato.
export function combinarHoras(mar, viento) {
  const porHora = new Map();
  const tomar = (json, campos) => {
    const h = json?.hourly;
    if (!h || !Array.isArray(h.time)) throw new Error('Respuesta de Open-Meteo sin datos horarios');
    h.time.forEach((hora, i) => {
      const fila = porHora.get(hora) ?? { hora, hs: null, tp: null, vientoKmh: null, dirViento: null };
      for (const [origen, destino] of Object.entries(campos)) fila[destino] = h[origen]?.[i] ?? null;
      porHora.set(hora, fila);
    });
  };
  tomar(mar, { wave_height: 'hs', wave_period: 'tp' });
  tomar(viento, { wind_speed_10m: 'vientoKmh', wind_direction_10m: 'dirViento' });
  return [...porHora.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

// 'YYYY-MM-DDTHH:MM' en hora de Lima (UTC-5, sin horario de verano).
export const ahoraLima = (ms) => new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 16);

// Horas de `fecha` ('YYYY-MM-DD') dentro de la ventana [horaInicio, horaFin). Para el día en curso,
// descarta las horas que ya pasaron.
export function horasDelDia(horas, fecha, ventana, ahoraMs) {
  const ahora = ahoraLima(ahoraMs);
  return horas.filter((h) => {
    if (!h.hora.startsWith(fecha)) return false;
    const n = Number(h.hora.slice(11, 13));
    if (n < ventana.horaInicio || n >= ventana.horaFin) return false;
    return h.hora.slice(0, 13) >= ahora.slice(0, 13);
  });
}

export async function cargarMar(playa, fetchFn = fetch) {
  const [mar, viento] = await Promise.all(
    [urlMar(playa), urlViento(playa)].map(async (url) => {
      const r = await fetchFn(url);
      if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
      return r.json();
    }),
  );
  return combinarHoras(mar, viento);
}
````

- [ ] **Paso 4: Ejecutar toda la suite**

Ejecutar: `npm test`
Esperado: `tests 48`, `pass 48`, `fail 0`.

- [ ] **Paso 5: Commit**

```bash
git add site/js/mar.js tests/mar.test.js
git commit -m "feat(site): lectura de oleaje y viento por playa desde Open-Meteo"
```

---

### Tarea 7: Interfaz y herramientas locales

**Archivos:**
- Crear: `site/index.html`, `site/style.css`, `site/js/app.js`, `site/manifest.json`, `site/icon.svg`, `scripts/build-site.mjs`, `scripts/serve.mjs`

No hay pruebas automáticas de interfaz (decisión del spec); la verificación es manual en el navegador.

- [ ] **Paso 1: Crear `site/index.html`**

````html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Boletín Olas</title>
  <meta name="description" content="¿Es buen día para remar en mar calmo en San Bartolo, Punta Hermosa, Yuyos o La Punta?">
  <meta name="theme-color" content="#0b5ea8">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Boletín Olas</h1>
    <p>Remo en mar calmo · Lima sur y Callao</p>
  </header>
  <main id="app" aria-live="polite">
    <noscript>Esta página necesita JavaScript para consultar el mar.</noscript>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
````

- [ ] **Paso 2: Crear `site/style.css`**

````css
:root {
  --fondo: #f4f7fa;
  --tarjeta: #ffffff;
  --texto: #14202b;
  --suave: #5a6b7a;
  --borde: #d5dde5;
  --verde: #1e7a46;
  --verde-fondo: #e0f3e8;
  --amarillo: #8a5a00;
  --amarillo-fondo: #fff1cc;
  --rojo: #a4262c;
  --rojo-fondo: #fde3e3;
  --acento: #0b5ea8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fondo: #0e161d;
    --tarjeta: #16212b;
    --texto: #e6edf3;
    --suave: #9fb0bf;
    --borde: #2a3947;
    --verde: #66d19a;
    --verde-fondo: #123324;
    --amarillo: #f2c14e;
    --amarillo-fondo: #3a2e0d;
    --rojo: #ff8b8b;
    --rojo-fondo: #3d1517;
    --acento: #6db3f2;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--fondo);
  color: var(--texto);
  font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
header, main { max-width: 640px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 20px; padding-bottom: 4px; }
h1 { margin: 0; font-size: 1.4rem; }
header p { margin: 2px 0 0; color: var(--suave); font-size: .9rem; }
main { padding-bottom: 32px; display: grid; gap: 12px; margin-top: 12px; }
a { color: var(--acento); }
.cargando { color: var(--suave); }

.banner { border-radius: 10px; padding: 12px 14px; border: 1px solid var(--borde); }
.banner p { margin: 4px 0 0; }
.banner.rojo { background: var(--rojo-fondo); color: var(--rojo); border-color: var(--rojo); }
.banner.amarillo { background: var(--amarillo-fondo); color: var(--amarillo); border-color: var(--amarillo); }
pre { white-space: pre-wrap; font: .8rem/1.4 ui-monospace, Menlo, Consolas, monospace; color: var(--texto); }

.dias { display: flex; gap: 8px; }
.dias button {
  flex: 1; padding: 10px 6px; border-radius: 10px; border: 1px solid var(--borde);
  background: var(--tarjeta); color: var(--texto); font: inherit; font-size: .85rem; cursor: pointer;
}
.dias button[aria-pressed="true"] { background: var(--acento); color: #fff; border-color: var(--acento); }
.dias button:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }

.mejor { border-radius: 12px; padding: 14px 16px; border: 1px solid var(--borde); background: var(--tarjeta); }
.mejor h2 { margin: 0; font-size: 1.3rem; }
.mejor .sobre { margin: 0 0 2px; font-size: .8rem; color: var(--suave); text-transform: uppercase; letter-spacing: .04em; }
.mejor.verde { background: var(--verde-fondo); color: var(--verde); border-color: var(--verde); }
.mejor.amarillo { background: var(--amarillo-fondo); color: var(--amarillo); border-color: var(--amarillo); }
.mejor.ninguna { color: var(--rojo); background: var(--rojo-fondo); border-color: var(--rojo); }

.playa { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 12px; padding: 0 16px; }
.playa.sin-datos { padding: 12px 16px; color: var(--suave); }
.playa h3 { margin: 0 0 4px; font-size: 1rem; }
.playa summary { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 0; cursor: pointer; list-style: none; }
.playa summary::-webkit-details-marker { display: none; }
.nombre { font-weight: 600; }
.chip { padding: 4px 10px; border-radius: 999px; font-size: .9rem; font-weight: 600; white-space: nowrap; }
.chip.verde { background: var(--verde-fondo); color: var(--verde); }
.chip.amarillo { background: var(--amarillo-fondo); color: var(--amarillo); }
.chip.rojo { background: var(--rojo-fondo); color: var(--rojo); }
.motivo { margin: 0 0 8px; }
.nota { margin: 0 0 8px; font-size: .85rem; color: var(--amarillo); }
table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-bottom: 14px; }
th { text-align: left; color: var(--suave); font-weight: 500; padding: 4px 4px 4px 0; }
td { padding: 5px 4px 5px 0; border-top: 1px solid var(--borde); }
tr.verde td:last-child { color: var(--verde); }
tr.amarillo td:last-child { color: var(--amarillo); }
tr.rojo td:last-child { color: var(--rojo); }

footer { font-size: .85rem; }
footer p { margin: 6px 0; }
.gris { color: var(--suave); }
.chip.gris { background: var(--borde); color: var(--suave); }
````

- [ ] **Paso 3: Crear `site/js/app.js`**

````js
import { cargarMar, horasDelDia, ahoraLima } from './mar.js';
import { evaluarPlayaDia, evaluarTsunami, mejorPlaya, estadoDhn } from './score.js';

const SIMBOLO = { verde: '✔', amarillo: '⚠', rojo: '✖' };
const ETIQUETA = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };
const ZONA = 'America/Lima';

// Todo el texto remoto (DHN, Open-Meteo) entra con textContent: nunca como HTML.
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') nodo.className = v;
    else if (k === 'text') nodo.textContent = v;
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h) nodo.append(h);
  return nodo;
}

const num1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const fmt = (ms, opts) => new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, ...opts }).format(ms);
const fechaCorta = (ms) => fmt(ms, { weekday: 'short', day: 'numeric', month: 'short' });
const horaCorta = (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

async function cargarJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const estado = { dia: 0, config: null, dhn: null, mar: [], ahoraMs: 0, marMs: 0 };

async function iniciar() {
  const raiz = document.getElementById('app');
  raiz.replaceChildren(el('p', { class: 'cargando', text: 'Consultando el mar y el aviso del DHN…' }));
  estado.config = await cargarJson('./config.json');
  estado.dhn = await cargarJson('./data/dhn.json').catch(() => null);
  const resultados = await Promise.allSettled(estado.config.playas.map((p) => cargarMar(p)));
  estado.mar = resultados.map((r) => (r.status === 'fulfilled' ? r.value : null));
  estado.ahoraMs = Date.now();
  estado.marMs = estado.ahoraMs;
  pintar();
}

function fechaDelDia(offset) {
  const base = ahoraLima(estado.ahoraMs).slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function evaluarTodo() {
  const { config, dhn, ahoraMs } = estado;
  const tsun = evaluarTsunami(dhn?.tsunami, ahoraMs);
  const fecha = fechaDelDia(estado.dia);
  const resultados = config.playas.map((playa, i) => {
    const horas = estado.mar[i];
    if (!horas) return { playa, sinMar: true, color: 'rojo', bloque: null, horas: [], notas: [], motivo: '' };
    return evaluarPlayaDia({
      playa,
      horasCrudas: horasDelDia(horas, fecha, config.ventana, ahoraMs),
      aviso: dhn?.aviso ?? null,
      dhn,
      ahoraMs,
      config,
      tsunamiAlerta: tsun.estado === 'alerta',
    });
  });
  return { tsun, resultados };
}

function pintar() {
  const { tsun, resultados } = evaluarTodo();
  const raiz = document.getElementById('app');
  const piezas = [
    bannerTsunami(tsun),
    bannerDhn(),
    pestanas(),
    mejorOpcion(resultados),
    ...resultados.map(tarjeta),
    pie(tsun),
  ];
  raiz.replaceChildren(...piezas.filter(Boolean));
}

function bannerTsunami(tsun) {
  if (tsun.estado !== 'alerta') return null;
  const b = tsun.boletin;
  return el('section', { class: 'banner rojo', role: 'alert' },
    el('strong', { text: `✖ Alerta del DHN: boletín de sismo/tsunami ${b.numero}` }),
    el('p', { text: 'Todas las playas figuran en rojo. No salgas al mar: revisa dhn.mil.pe o la app MGP Tsunamis.' }),
    el('details', {}, el('summary', { text: 'Texto del boletín' }), el('pre', { text: b.textoCrudo })));
}

function bannerDhn() {
  const { dhn, ahoraMs, config } = estado;
  const e = estadoDhn(dhn, ahoraMs, config.umbrales);
  if (e === 'ok') return null;
  const mensajes = {
    ausente: 'No pude cargar los datos del DHN.',
    obsoleto: 'Los datos del DHN llevan más de 36 horas sin actualizarse.',
    errorParseo: 'No pude leer el último aviso del DHN.',
  };
  const crudo = dhn?.avisoCrudo;
  return el('section', { class: 'banner amarillo', role: 'status' },
    el('strong', { text: `⚠ ${mensajes[e]}` }),
    el('p', { text: 'Ninguna playa pasa de amarillo hasta que revises el aviso en dhn.mil.pe.' }),
    crudo ? el('details', {}, el('summary', { text: crudo.titulo }), el('pre', { text: crudo.texto })) : null);
}

function pestanas() {
  const etiquetas = ['Hoy', 'Mañana', 'Pasado'];
  return el('nav', { class: 'dias', 'aria-label': 'Día' }, etiquetas.map((t, i) => {
    const b = el('button', { type: 'button', text: `${t} · ${fechaCorta(Date.parse(`${fechaDelDia(i)}T12:00:00-05:00`))}`, 'aria-pressed': String(i === estado.dia) });
    b.addEventListener('click', () => { estado.dia = i; pintar(); });
    return b;
  }));
}

function mejorOpcion(resultados) {
  const mejor = mejorPlaya(resultados);
  if (resultados.every((r) => !r.sinMar && r.horas.length === 0)) {
    return el('section', { class: 'mejor ninguna' }, el('h2', { text: 'Ya no quedan horas hoy' }), el('p', { text: 'La ventana de remo es de 6 a 17 h. Mira Mañana.' }));
  }
  if (!mejor) {
    return el('section', { class: 'mejor ninguna' }, el('h2', { text: 'Ninguna playa apta' }), el('p', { text: 'Con los datos actuales no hay un bloque de 2 horas o más para remar en mar calmo.' }));
  }
  return el('section', { class: `mejor ${mejor.color}` },
    el('p', { class: 'sobre', text: 'Mejor opción' }),
    el('h2', { text: `${SIMBOLO[mejor.color]} ${mejor.playa.nombre} · ${mejor.bloque.desde}–${mejor.bloque.hasta} h` }));
}

function tarjeta(r) {
  if (r.sinMar) {
    return el('article', { class: 'playa sin-datos' }, el('h3', { text: r.playa.nombre }), el('p', { text: 'No pude obtener el mar ahora. Reintenta más tarde.' }));
  }
  const resumen = el('summary', {},
    el('span', { class: 'nombre', text: r.playa.nombre }),
    el('span', { class: `chip ${r.horas.length === 0 ? 'gris' : r.color}`, text: r.horas.length === 0 ? 'Sin horas' : `${SIMBOLO[r.color]} ${r.bloque ? `${r.bloque.desde}–${r.bloque.hasta} h` : ETIQUETA[r.color]}` }));
  const filas = r.horas.map((h) => el('tr', { class: h.color },
    el('td', { text: `${String(Number(h.hora.slice(11, 13)))} h` }),
    el('td', { text: h.dato.hs === null ? '—' : `${num1(h.dato.hs)} m` }),
    el('td', { text: h.dato.tp === null ? '—' : `${num1(h.dato.tp)} s` }),
    el('td', { text: h.dato.vientoKmh === null ? '—' : `${Math.round(h.dato.vientoKmh)} km/h` }),
    el('td', { text: `${SIMBOLO[h.color]} ${ETIQUETA[h.color]}` })));
  return el('article', { class: 'playa' },
    el('details', {}, resumen,
      el('p', { class: 'motivo', text: r.motivo }),
      ...r.notas.map((n) => el('p', { class: 'nota', text: n })),
      r.horas.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Hora', 'Ola', 'Periodo', 'Viento', 'Estado'].map((t) => el('th', { text: t })))), el('tbody', {}, filas)) : null));
}

function pie(tsun) {
  const { dhn, marMs } = estado;
  const aviso = dhn?.aviso;
  const lineas = [];
  if (aviso) {
    lineas.push(el('p', {}, `DHN: aviso ${aviso.numero}, válido hasta el ${aviso.validoHasta.split('-').reverse().join('/')}. `, el('a', { href: aviso.url, text: 'Ver aviso', rel: 'noopener' })));
  }
  if (tsun.estado === 'informativo') {
    const b = tsun.boletin;
    lineas.push(el('p', { class: 'gris', text: `Sismo ${b.magnitud ?? '?'} Mw ${b.lugar ?? ''}: sin tsunami en el litoral peruano (boletín ${b.numero}).` }));
  }
  lineas.push(el('p', { class: 'gris', text: `Datos del DHN leídos: ${dhn ? `${fechaCorta(Date.parse(dhn.generadoEn))} ${horaCorta(Date.parse(dhn.generadoEn))}` : 'no disponible'} · Mar consultado: ${horaCorta(marMs)}` }));
  lineas.push(el('p', { class: 'gris', text: 'Los datos de oleaje son de modelo (Open-Meteo), no medidos en la orilla; San Bartolo, Punta Hermosa y Yuyos pueden compartir la misma celda. Es una ayuda para decidir, no un permiso: manda lo que veas en la orilla y cualquier cierre de puerto. Antes de salir revisa dhn.mil.pe o la app MGP Tsunamis.' }));
  lineas.push(el('p', { class: 'gris' },
    el('a', { href: 'https://www.dhn.mil.pe/portal/', text: 'dhn.mil.pe', rel: 'noopener' }), ' · ',
    el('a', { href: 'https://www.dhn.mil.pe/portal/boletin-diario-condiciones-oceanograficas', text: 'Boletín oceanográfico diario', rel: 'noopener' }), ' · ',
    el('a', { href: 'https://www.dhn.mil.pe/portal/boletin-sismo-tsunami', text: 'Sismo y tsunami', rel: 'noopener' })));
  return el('footer', {}, lineas);
}

iniciar().catch((e) => {
  document.getElementById('app').replaceChildren(el('section', { class: 'banner rojo', role: 'alert' }, el('strong', { text: 'No pude iniciar la página.' }), el('p', { text: String(e.message) })));
});
````

- [ ] **Paso 4: Crear `site/manifest.json` y `site/icon.svg`**

`site/manifest.json`:

````json
{
  "name": "Boletín Olas",
  "short_name": "Olas",
  "description": "¿Es buen día para remar en mar calmo en Lima sur y Callao?",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#f4f7fa",
  "theme_color": "#0b5ea8",
  "lang": "es",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }]
}
````

`site/icon.svg`:

````svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b5ea8"/><path d="M8 38c6-8 12-8 18 0s12 8 18 0 8-6 12-3" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M8 50c6-8 12-8 18 0s12 8 18 0 8-6 12-3" fill="none" stroke="#9fd0f7" stroke-width="5" stroke-linecap="round"/></svg>
````

- [ ] **Paso 5: Crear los scripts locales**

`scripts/build-site.mjs`:

````js
// Arma _site/ (lo que publica GitHub Pages): site/ + data/dhn.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(raiz, '_site');

fs.rmSync(salida, { recursive: true, force: true });
fs.cpSync(path.join(raiz, 'site'), salida, { recursive: true });
const dhn = path.join(raiz, 'data', 'dhn.json');
if (fs.existsSync(dhn)) {
  fs.mkdirSync(path.join(salida, 'data'), { recursive: true });
  fs.copyFileSync(dhn, path.join(salida, 'data', 'dhn.json'));
}
console.log(`_site listo (${fs.existsSync(dhn) ? 'con' : 'sin'} data/dhn.json)`);
````

`scripts/serve.mjs`:

````js
// Servidor estático mínimo para ver _site/ en local: node scripts/serve.mjs [puerto]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const puerto = Number(process.argv[2] ?? 8080);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = path.join(raiz, ruta.endsWith('/') ? `${ruta}index.html` : ruta);
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404).end('no encontrado');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
}).listen(puerto, () => console.log(`http://localhost:${puerto}`));
````

- [ ] **Paso 6: Verificación manual en el navegador**

```bash
npm run dhn      # si aún no existe data/dhn.json
npm run build
npm run serve    # abre http://localhost:8080
```

Comprueba en el navegador, en ancho de móvil (≈ 390 px) y en modo oscuro del sistema:

1. No hay errores en la consola y no aparece el texto "null".
2. Hay pestañas Hoy / Mañana / Pasado; cambian la lista al tocarlas.
3. Cada playa muestra un chip con símbolo y texto (✔ / ⚠ / ✖), no solo color. Al tocar una tarjeta se abre la tabla horaria con ola, periodo y viento (con coma decimal).
4. Si ya pasaron las 17:00, "Hoy" dice "Ya no quedan horas hoy" y los chips dicen "Sin horas".
5. El pie muestra el aviso del DHN, la línea de sismo (gris, "sin tsunami") si corresponde, la hora de la lectura del DHN y del mar, y los enlaces.
6. Borra `_site/data/dhn.json` y recarga: debe aparecer el banner amarillo "No pude cargar los datos del DHN" y **ninguna playa en verde**.
7. Edita `_site/data/dhn.json`: cambia en un boletín `generaTsunamiEnPeru` a `true` y `fechaLocal` a la hora actual de Lima. Recarga: banner rojo y todas las playas en rojo. (Vuelve a ejecutar `npm run build` después.)

Anota cualquier fallo y corrígelo antes del commit.

- [ ] **Paso 7: Commit**

```bash
git add site scripts
git commit -m "feat(site): interfaz móvil con semáforo por playa y herramientas locales"
```

---

### Tarea 8: Workflow, README y publicación

**Archivos:**
- Crear: `.github/workflows/publicar.yml`, `README.md`

- [ ] **Paso 1: Crear `.github/workflows/publicar.yml`**

````yaml
name: Publicar

on:
  schedule:
    - cron: '30 10 * * *' # 10:30 UTC = 05:30 hora de Lima
  workflow_dispatch: # botón "Run workflow" para correrlo a demanda
  push:
    branches: [main]
    paths: ['site/**', 'scripts/**', '.github/workflows/publicar.yml']

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: publicar
  cancel-in-progress: false

jobs:
  publicar:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.pages.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Pruebas
        run: npm test

      - name: Leer el DHN
        if: github.event_name != 'push'
        run: npm run dhn

      - name: Guardar dhn.json
        if: github.event_name != 'push'
        run: |
          git config user.name "boletin-olas[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add data/dhn.json
          git commit -m "datos: dhn.json $(date -u +%Y-%m-%dT%H:%MZ)" || echo "sin cambios"
          git push

      - name: Armar el sitio
        run: npm run build

      - uses: actions/configure-pages@v5
        id: pages
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - uses: actions/deploy-pages@v4
````

- [ ] **Paso 2: Crear `README.md`**

````markdown
# Boletín Olas

¿Es buen día para remar en mar calmo en San Bartolo, Punta Hermosa, Yuyos o La Punta?

- **Qué hace:** lee el aviso de oleaje y los boletines de sismo/tsunami del DHN (job diario) y consulta oleaje y viento por playa en Open-Meteo (en vivo, desde el navegador). Muestra un semáforo por playa y por hora (06–17 h).
- **Diseño:** `docs/superpowers/specs/2026-10-09-boletin-olas-design.md`
- **Umbrales:** `site/config.json` (se calibran con `npm run valores`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas (parsers sobre HTML real del DHN, scorer, Open-Meteo) |
| `npm run dhn` | Lee el DHN y escribe `data/dhn.json` |
| `npm run build` | Arma `_site/` (sitio + `dhn.json`) |
| `npm run serve` | Sirve `_site/` en http://localhost:8080 |
| `npm run valores` | Imprime ola/periodo/viento de hoy por playa, para calibrar |

## Publicación (GitHub Pages)

1. En el repo: **Settings → Pages → Source: GitHub Actions**.
2. **Actions → Publicar → Run workflow** para la primera corrida (crea `data/dhn.json` y publica).
3. Después corre solo cada día a las 05:30 (hora de Lima). Para forzar una lectura antes de salir: **Run workflow**.
4. Si GitHub pausa el cron por inactividad (60 días sin commits), se reactiva con un clic en Actions.

## Importante

Es una ayuda para decidir, no un permiso de seguridad. Los datos de oleaje son de modelo (no medidos en la orilla). Antes de salir revisa dhn.mil.pe o la app MGP Tsunamis; manda lo que veas en la orilla y cualquier cierre de puerto.
````

- [ ] **Paso 3: Ejecutar toda la suite y el build**

```bash
npm test
npm run build
```

Esperado: `pass 48`, `fail 0`; `_site listo`.

- [ ] **Paso 4: Commit**

```bash
git add .github README.md
git commit -m "ci: workflow diario y manual que lee el DHN y publica en Pages; README"
```

- [ ] **Paso 5: Pedir confirmación al usuario antes de publicar**

`git push` envía código a un servicio externo. Pregunta al usuario: "¿Hago `git push -u origin main` a `https://github.com/javierpinazo/Boletin-Olas.git`? El repo ya debe existir vacío en GitHub." Solo con un sí explícito:

```bash
git push -u origin main
```

- [ ] **Paso 6: Pedir al usuario los pasos que solo él puede hacer en GitHub**

1. **Settings → Pages → Source: GitHub Actions.**
2. **Actions → Publicar → Run workflow** (rama `main`).

- [ ] **Paso 7: Verificar la primera corrida**

Con el usuario, comprueba que: el workflow termina en verde; existe el commit `datos: dhn.json …` en `main`; la URL de Pages (que muestra el workflow) abre la página con el aviso del DHN en el pie y sin banners de error. Si el paso "Leer el DHN" falla, abre el log: es información sobre el DHN, no un fallo del workflow.

---

### Tarea 9: Calibración con salidas reales

**Archivos:**
- Crear: `scripts/valores-hoy.mjs`
- Modificar: `package.json` (el script `valores` ya está en el `package.json` de la Tarea 1), `site/config.json` (umbrales y coordenadas)

El modelo de Open-Meteo reportó olas de ≈ 1,5–1,7 m con periodo ≈ 12–13 s en estas playas incluso en un día de aviso "ligero" (9 de octubre de 2026). Con los umbrales actuales eso es **rojo** todo el día. Es probable que el modelo sobreestime la ola en la orilla de estas bahías, así que antes de fiarse del semáforo hay que calibrarlo.

- [ ] **Paso 1: Crear `scripts/valores-hoy.mjs`**

````js
// Imprime ola/periodo/viento de cada playa para hoy: sirve para calibrar los umbrales de
// site/config.json comparándolos con lo que ves en la orilla. Uso: npm run valores
import fs from 'node:fs';
import { cargarMar, horasDelDia } from '../site/js/mar.js';

const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
const ahora = Date.now();
const fecha = new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10);

for (const playa of config.playas) {
  const horas = await cargarMar(playa);
  const dia = horasDelDia(horas, fecha, { horaInicio: 0, horaFin: 24 }, 0);
  console.log(`\n${playa.nombre} (${fecha})`);
  console.log('hora  ola(m)  periodo(s)  viento(km/h)  dir(°)');
  for (const h of dia.filter((x) => Number(x.hora.slice(11, 13)) % 3 === 0)) {
    console.log(`${h.hora.slice(11)}  ${String(h.hs).padEnd(6)}  ${String(h.tp).padEnd(10)}  ${String(h.vientoKmh).padEnd(12)}  ${h.dirViento}`);
  }
}
````

- [ ] **Paso 2: Probarlo**

Ejecutar: `npm run valores`
Esperado: una tabla por playa con ola, periodo, viento y dirección cada 3 horas.

- [ ] **Paso 3: Commit**

```bash
git add scripts/valores-hoy.mjs
git commit -m "chore: script para calibrar umbrales con los valores del modelo"
```

- [ ] **Paso 4: Calibrar con el usuario (no es automatizable)**

Cada vez que el usuario salga a remar: antes de salir, anotar lo que muestra la página y `npm run valores`; después, anotar cómo estaba realmente el mar (¿plano, con olas, apto?). Tras 3–4 salidas, proponer al usuario nuevos umbrales de altura/periodo en `site/config.json` (cambia solo números; las pruebas del scorer usan sus propios valores de `config.json`, así que ejecútalas: si alguna depende de un umbral cambiado, actualiza el caso con el nuevo límite exacto). Confirmar también las coordenadas de las 4 playas con el usuario (Yuyos es la más incierta).

- [ ] **Paso 5: Commit de la calibración**

```bash
git add site/config.json tests
git commit -m "chore: calibrar umbrales con salidas reales"
```
