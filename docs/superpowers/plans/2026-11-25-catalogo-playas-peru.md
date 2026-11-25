# Catálogo de playas del Perú y "Mis playas": plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cualquier remero del Perú elige sus playas de un catálogo (por texto o GPS) y las usa a diario; todo probado en local.

**Architecture:** `site/playas.json` (zonas de temperatura + playas) reemplaza a `config.playas`. Dos módulos puros (`catalogo.js`, `mis-playas.js`) y uno de interfaz (`selector.js`); `app.js` sigue leyendo `estado.config.playas`, que ahora son las playas elegidas. El job de temperatura trabaja por zona, con plazo.

**Tech Stack:** JavaScript ES modules sin dependencias, Node ≥ 22, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-catalogo-playas-peru-design.md`

## Global Constraints

- **Solo local.** No hacer `git push`, no usar SSH, no tocar `deploy/vps/*.sh`, nginx ni n8n. Commits solo en la rama local `feat/catalogo-playas` (la VPS solo toma `origin/main`).
- Sin dependencias nuevas, sin framework, mismo CSP (ningún dominio nuevo para el navegador).
- Texto remoto o del catálogo siempre con `textContent` (usar `el()` de `app.js`). Sin atributo `style` (CSP).
- No cambiar reglas ni umbrales de `site/js/score.js`.
- Máximo de Mis playas: **6**. Sin `factorOla` en el catálogo vale **1**; las 4 actuales conservan `id`, coordenadas, orientación, `0.31` y `latTramo`.
- Textos exactos: "Sin calibrar", "Ubicación y orientación sin verificar por remeros de la zona", "Agrega tu playa", "Cerca de mí", "Grifos destacados".
- La ubicación del remero no se guarda ni se envía.
- `npm test` en verde al cerrar cada tarea (hoy: 220 pruebas).

## Review Focus

1. Usuario nuevo que abre la app, no elige nada y vuelve: sigue viendo "Agrega tu playa", no las 4 de Lima aunque ya haya caché guardada (Tarea 2).
2. Cero playas: no se consulta Open-Meteo con coordenadas vacías ni sale "No pude obtener el mar"; tsunami y DHN se siguen mostrando (Tarea 4).
3. Almacenamiento corrupto o bloqueado, lista con ids inexistentes, repetidos o más de 6: la app abre (Tarea 2).
4. Playas más al sur de la latitud de Tacna (no solo al norte de Tumbes) tienen tramo del DHN mediante `latTramo` (Tarea 1).
5. NOAA colgado: el job de temperatura termina dentro de su plazo y conserva lo anterior (Tarea 3).

---

### Task 1: Catálogo de playas

**Files:**
- Create: `site/playas.json`, `site/js/catalogo.js`, `scripts/verificar-catalogo.mjs`, `tests/catalogo.test.js`
- Modify: `site/config.json` (quitar `playas`), `scripts/valores-hoy.mjs`, `tests/score.test.js`, `tests/salidas.test.js`, `tests/corpus-2026.test.js`

**Interfaces — Produces:**
- `playas.json`: `{ fuente: string, zonas: [{id, nombre, lat, lon}], playas: [{id, nombre, region, lat, lon, orientacion, zonaTemp, verificada: boolean, factorOla?, latTramo?}] }`, playas ordenadas de norte a sur.
- `normalizar(texto) -> string` (sin tildes, minúsculas, sin espacios sobrantes)
- `buscar(playas, consulta) -> playa[]` (todas las palabras deben estar en nombre + región; consulta vacía devuelve todas; conserva el orden)
- `distanciaKm({lat, lon}, {lat, lon}) -> number` (haversine, R = 6371)
- `cercanas(playas, posicion, n = 5) -> [{playa, km}]` ordenadas por `km`

Contenido del catálogo:
- Zonas (14), `id lat lon`: tumbes -3.65 -80.75 · mancora -4.10 -81.10 · paita -5.08 -81.15 · lambayeque -6.85 -79.98 · trujillo -8.10 -79.15 · chimbote -9.10 -78.65 · huacho -11.12 -77.67 · callao -12.07 -77.20 · lima-sur -12.40 -76.82 · canete -13.10 -76.45 · paracas -13.83 -76.30 · marcona -15.37 -75.20 · arequipa -16.65 -72.75 · ilo -17.70 -71.40
- `region`: Tumbes, Piura, Lambayeque, La Libertad, Áncash, Lima, Callao, Ica, Arequipa, Moquegua, Tacna.
- Candidatas: Puerto Pizarro, Zorritos, Punta Sal · Máncora, Vichayito, Los Órganos, Cabo Blanco, Lobitos, Colán, Yacila · Pimentel, Santa Rosa, Puerto Eten · Pacasmayo, Puerto Malabrigo, Huanchaco, Salaverry · Chimbote, Vesique, Tortugas, Tuquillo · Végueta, Huacho, Chancay, Ancón, las 4 actuales, Chorrillos (Pescadores), Pucusana, Santa María del Mar, Cerro Azul · El Chaco (Paracas), Lagunillas, San Juan de Marcona · Puerto Inca, Atico, Camaná, Quilca, Matarani, Mollendo · Ilo · Vila Vila, Boca del Río.
- Coordenadas: de OpenStreetMap (Nominatim, máximo 1 petición por segundo, User-Agent genérico, sin datos del usuario), sobre la orilla de remo. Cada resultado se revisa: región correcta y sobre la costa. La candidata que no se pueda ubicar con certeza se omite y se reporta; no se inventan coordenadas.
- `orientacion`: estimada de la forma de la costa en OSM. Todas las nuevas con `verificada: false`; las 4 actuales `true`.
- `latTramo`: `-3.57` si `lat > -3.57`; `-18.0` si `lat < -18.0`; La Punta conserva `-12.05`.
- `fuente`: "Ubicaciones: © colaboradores de OpenStreetMap (ODbL). Orientación estimada."

- [ ] **Step 1:** Crear la rama: `git switch -c feat/catalogo-playas`, y commit de la spec y este plan.
- [ ] **Step 2:** Escribir `tests/catalogo.test.js`:
  - `catálogo: ids únicos en formato kebab-case y campos completos` (nombre, region de la lista, lat en [-18.4, -3.38], lon en [-81.4, -70.3], orientacion en [0, 360), `zonaTemp` existe en `zonas`, `verificada` booleano)
  - `catálogo: las 4 originales no cambian` — comparar con `deepEqual` de `{lat, lon, orientacion, factorOla, latTramo}`: yuyos `-12.149, -77.026, 225, 0.31`; la-punta `-12.071, -77.164, 15, 0.31, -12.05`; punta-hermosa `-12.337, -76.826, 240, 0.31`; san-bartolo `-12.389, -76.779, 260, 0.31`
  - `catálogo: las nuevas no heredan factor` — fuera de las 4, `factorOla === undefined` y `verificada === false`
  - `catálogo: cada playa cae en un tramo del DHN` — aviso sintético con los tramos `{desde:'tumbes', hasta:'salaverry', desdeExclusivo:false}`, `{desde:'salaverry', hasta:'san juan de marcona', desdeExclusivo:true}`, `{desde:'san juan de marcona', hasta:'tacna', desdeExclusivo:true}`; `tramoParaPlaya(p, aviso)` no es null
  - `catálogo: cubre las 11 regiones y va de norte a sur` (cada región con ≥ 1 playa; `lat` de `latTramo ?? lat` no se exige, `lat` no creciente salvo tolerancia de 0.2°)
  - `buscar: ignora tildes y mayúsculas` — `buscar(p, 'MANCORA')` incluye `mancora`; `buscar(p, 'la libertad huan')` incluye `huanchaco`; `buscar(p, '  ')` devuelve todas; `buscar(p, 'zzz')` devuelve `[]`
  - `cercanas: ordena por distancia` — desde `{lat:-4.11, lon:-81.05}` la primera es `mancora` y `km < 10`; devuelve 5; `distanciaKm` entre `(-12,-77)` y `(-13,-77)` está entre 110 y 112
- [ ] **Step 3:** `node --test tests/catalogo.test.js` → FAIL (no existe el módulo).
- [ ] **Step 4:** Crear `catalogo.js` y `playas.json`. Quitar `playas` de `config.json`. En las 3 pruebas existentes, leer las 4 originales desde `playas.json` filtrando por esos ids (los tests de "config: cada playa…" pasan a recorrer el catálogo, con `factorOla ?? 1`). `valores-hoy.mjs` lee `playas.json`; argumentos = ids, sin argumentos las 4 originales.
- [ ] **Step 5:** Crear `scripts/verificar-catalogo.mjs`: una consulta marina a Open-Meteo con todas las coordenadas (`urlVarias`/`cargarMarVarias`), imprime por playa la ola de las 12 h y marca las que no traen `hs`; termina con código 1 si alguna falta. Ejecutarlo → código 0 (corregir o retirar las que fallen).
- [ ] **Step 6:** `npm test` → PASS. Commit `feat: catálogo de playas del Perú`.

### Task 2: Mis playas (lógica)

**Files:** Create: `site/js/mis-playas.js`, `tests/mis-playas.test.js`

**Interfaces — Produces:**
- `MAX_PLAYAS = 6`, `CLAVE_MIS_PLAYAS = 'boletin-olas:mis-playas:v1'`, `ORIGINALES = ['yuyos','la-punta','punta-hermosa','san-bartolo']`
- `iniciarMisPlayas(storage, idsCatalogo: string[]) -> string[]` — si hay lista guardada, la sanea (solo ids del catálogo, sin repetidos, máximo 6). Si no hay: usuario actual (existe `boletin-olas:salidas:v1` o alguna clave con prefijo `cache:v1:`, mirando `storage.length`/`storage.key(i)`) → `ORIGINALES`; si no → `[]`. **Guarda el resultado de inmediato**, también `[]`.
- `agregar(lista, id) -> string[]` (no repite; con 6 devuelve la misma lista), `quitar(lista, id) -> string[]`, `mover(lista, id, paso: -1|1) -> string[]` (sin salirse)
- `guardarMisPlayas(storage, lista) -> boolean` (nunca lanza)

- [ ] **Step 1:** Pruebas con un `storage` falso (`getItem`, `setItem`, `key`, `length`):
  - nuevo → `[]`; segunda llamada tras guardar una clave `cache:v1:temp-mar` → sigue `[]`
  - con salidas guardadas → `ORIGINALES`; solo con caché → `ORIGINALES`
  - guardado `['x','mancora','mancora']` → `['mancora']`; 8 ids válidos → los primeros 6
  - JSON corrupto y valor `{"a":1}` → no lanza, devuelve `[]`
  - `storage` `undefined` o con `getItem`/`setItem` que lanzan → `[]`, `guardarMisPlayas` → `false`
  - `agregar` con 6 no cambia; `mover` del primero con `-1` no cambia; `mover(['a','b'],'b',-1)` → `['b','a']`
- [ ] **Step 2:** `node --test tests/mis-playas.test.js` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: lógica de Mis playas`.

### Task 3: Temperatura del mar por zonas

**Files:** Modify: `job/oisst.js`, `job/sst-openmeteo.js`, `job/temp-mar.js`, `job/run.js`, `scripts/clima-mar.mjs`, `site/clima-mar.json` (regenerado), `tests/temp-mar.test.js`

**Interfaces:**
- Consumes: `zonas` de `playas.json`.
- Produces:
  - `temp-mar.json`: `{ generadoEn, fuente, zonas: { [id]: { fecha, actual, fuente, serie, leidoEn } } }`
  - `clima-mar.json`: `{ fuente, zonas: { [id]: number[366] } }`
  - `construirTempMar(zonas, { fetchFn, ahora, espera, plazoMs = 60_000, previo = null }) -> Promise<json>`
  - `pedirCelda` y `pedirOpenMeteo` aceptan `senal?: AbortSignal`, que corta la petición y las esperas entre reintentos.

Reglas: una zona con `leidoEn` de menos de 12 h se reutiliza sin pedirla. Las demás se piden de a 4 en paralelo. NOAA dispone de 2/3 del plazo; Open-Meteo, del resto. Zona que falla conserva `previo.zonas[id]` (con su `leidoEn` viejo, para reintentar). Lanza solo si el resultado queda sin ninguna zona. `escribirTempMar(zonas, destino, opciones)` lee `destino` como `previo`; un archivo ilegible o con el formato antiguo (`playas`) cuenta como sin previo.

- [ ] **Step 1:** Adaptar las 5 pruebas a `zonas` y añadir:
  - zona leída hace 11 h → no hay ninguna llamada a `fetchFn` para ella; hace 13 h → se pide
  - una zona falla y hay previo → conserva la anterior y actualiza la otra
  - `fetchFn` que solo termina al abortar la señal, `plazoMs: 200`, `espera: 5000` → resuelve con el previo en menos de 1500 ms
  - previo con formato antiguo y todo falla → rechaza con `/respaldo/`
- [ ] **Step 2:** `node --test tests/temp-mar.test.js` → FAIL.
- [ ] **Step 3:** Implementar; `run.js` lee las zonas de `site/playas.json` (grifos sigue con `config`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `clima-mar.mjs` por zona, escribiendo el archivo tras cada zona y saltando las ya presentes (NOAA falla a ratos: se puede relanzar). Ejecutarlo. Verificar 14 zonas con 366 valores numéricos con un test añadido en `tests/catalogo.test.js`: `clima: cada zona tiene su habitual completo`. Si NOAA no responde para alguna, reportarlo y no inventar valores (la prueba queda pendiente y la pantalla oculta lo que falte).
- [ ] **Step 6:** `npm test` → PASS. Commit `feat: temperatura del mar por zonas`.

### Task 4: La app usa Mis playas

**Files:**
- Create: `site/js/selector.js`
- Modify: `site/js/app.js`, `site/style.css`

**Interfaces:**
- Consumes: Tareas 1–3.
- Produces: `panelSelector({ el, catalogo, ids, consulta, cerca, mensaje, alCambiar(ids), alBuscar(texto), alUbicar(), alCerrar() }) -> HTMLElement`

Comportamiento:
- `iniciar()` carga `config.json` y `playas.json`, llama a `iniciarMisPlayas` **antes** de cualquier lectura por `conCache`, y deja `estado.config = { ...config, playas: <elegidas en su orden> }`.
- Sin playas: no se llama a `cargarMarVarias`; `pintar()` muestra tsunami, aviso DHN, actualización, el selector con título "Agrega tu playa" y el pie.
- Con playas: botón "Mis playas" encima de las pestañas abre el selector (agregar, quitar, subir, bajar, "Listo"). Al pulsar "Listo" se llama a `iniciar()`; un contador de turno descarta el resultado de una carga anterior que termine tarde.
- Buscar: escribir actualiza solo la lista de resultados (el campo no pierde el foco ni se cierra el teclado). Resultados: "Nombre · Región" y botón "+" con `aria-label`; sin consulta, agrupados por región. Con 6, los "+" se deshabilitan y se dice "Máximo 6 playas".
- "Cerca de mí": `navigator.geolocation.getCurrentPosition` con `{ timeout: 15000, maximumAge: 600000 }`, solo al tocar. Muestra 5 con "a N km en línea recta"; si la primera supera 50 km: "La playa más cercana del catálogo está a N km". Errores: permiso negado, sin señal/tiempo agotado y navegador sin GPS tienen mensaje propio y remiten a la búsqueda.
- Si `guardarMisPlayas` devuelve `false`: "No pude guardar en este navegador: tu selección dura mientras la página esté abierta."
- Tarjeta de playa sin `factorOla` y sin factor aprendido: etiqueta "Sin calibrar"; en el detalle, `notaFactor` dice que usa la ola completa del modelo y cuántas salidas faltan. Con `verificada: false`: el texto de verificación.
- Temperatura (bloque, ficha y gráfico): promedio sobre las zonas **distintas** de las playas elegidas, usando `tempMar.zonas` y `climaMar.zonas`; sin datos, el bloque se oculta. Nota: "Referencia de la zona, mar abierto frente a la costa".
- Grifos: solo si alguna elegida tiene `region` `Lima` o `Callao`. "Tus grifos" → "Grifos destacados"; "Más baratos en tu ruta" → "Más baratos en las rutas al mar de Lima".
- Pie: atribución `catalogo.fuente`.
- El cambio de día y `visibilitychange` no cierran el selector abierto.

- [ ] **Step 1:** Implementar `selector.js` y los cambios de `app.js` y estilos (usar las variables de `:root[data-tema="oceano"]`; controles táctiles ≥ 44 px).
- [ ] **Step 2:** `npm test` → PASS y `node --check site/js/app.js && node --check site/js/selector.js` → sin salida.
- [ ] **Step 3:** `npm run build` y `node scripts/serve.mjs 8080 --local`; en el navegador comprobar y anotar el resultado de cada caso: usuario nuevo (almacenamiento vacío) → "Agrega tu playa", recargar → igual; sin errores en consola ni peticiones a Open-Meteo; agregar Huanchaco → "Sin calibrar", sin grifos; agregar Yuyos → aparecen grifos; reordenar y recargar conserva el orden; 7.ª playa bloqueada; con una salida previa y sin lista → las 4; buscar escribiendo seguido no pierde el foco; negar GPS muestra mensaje; ancho de 375 px sin desborde.
- [ ] **Step 4:** Commit `feat: elegir y usar Mis playas`.

### Task 5: Imagen para compartir, sin conexión, textos y prueba local

**Files:** Modify: `site/js/compartir.js`, `tests/compartir.test.js`, `site/sw.js`, `site/index.html`, `site/manifest.json`, `README.md`, `package.json`

**Interfaces — Produces:** `disposicionPlayas(n) -> { paso: number, alto: number, cifras: boolean }`

- [ ] **Step 1:** Prueba: `disposicionPlayas(4)` → `{paso:190, alto:170, cifras:true}`; `disposicionPlayas(6)` → `{paso:122, alto:106, cifras:false}`; para n de 1 a 6, `940 + (n-1)*paso + alto <= 1690`.
- [ ] **Step 2:** `node --test tests/compartir.test.js` → FAIL.
- [ ] **Step 3:** Implementar y usarla en `dibujarTarjeta` (compacta: punto, nombre y horario centrados).
- [ ] **Step 4:** `sw.js`: `VERSION = 'olas-v3'`; añadir a `APP` `./playas.json`, `./js/catalogo.js`, `./js/mis-playas.js`, `./js/selector.js`; `playas.json` usa "primero la red".
- [ ] **Step 5:** Textos: cabecera "Remo en mar calmo · Perú"; descripción en `index.html` y `manifest.json` "¿Es buen día para remar en mar calmo? Semáforo para playas de todo el Perú."; README (catálogo, Mis playas, cómo agregar o verificar una playa, `npm run probar`).
- [ ] **Step 6:** `package.json`: `"probar": "node job/run.js && node scripts/build-site.mjs && node scripts/serve.mjs --local"` — usa solo datos generados en la PC y no llama a la VPS. (`npm run hoy` no sirve para esta prueba: lee los datos de la VPS, que aún no tienen zonas.)
- [ ] **Step 7:** `npm test` → PASS. `npm run probar`: la temperatura por zonas aparece; comprobar la imagen con 4 y con 6 playas; con el servidor detenido y la página recargada, abre con lo guardado.
- [ ] **Step 8:** Commit `feat: compartir con 6 playas, sin conexión y textos para todo el Perú`. Verificar `git log origin/main..HEAD` (solo en la rama local) y que no se hizo push.
