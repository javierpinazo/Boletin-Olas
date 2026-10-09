# Boletín Olas — Diseño

Fecha: 2026-10-09 · Estado: aprobado (ajustado el 2026-10-09 tras probar contra el DHN real; ver plan)

## 1. Propósito

Una página web, usada desde el navegador (sobre todo el celular), que responde una pregunta:
**¿es buen día para remar en mar calmo hoy en San Bartolo, Punta Hermosa, Yuyos o La Punta?**

- Usuario: una persona, nivel intermedio, sale una vez por semana y decide el mismo día.
- Tipo de paddle: remo en mar calmo (flatwater). No es SUP surf.
- Debe mantenerse al día sin intervención y avisar si hay oleaje anómalo o alerta de tsunami.

Reemplaza el prototipo `oleaje_lima_dhn.html`, que dependía de un proxy público, llamaba a la API de
Anthropic sin clave y, si fallaba la descarga, mostraba un boletín de ejemplo como si fuera real.

## 2. Alcance

Dentro: lectura del aviso de oleaje y de los boletines de sismo/tsunami del DHN; datos marinos y de
viento por playa; semáforo por hora y por playa; interfaz móvil; job programado y a demanda.

Fuera (YAGNI): mareas, temperatura del agua, corrientes, historial, cuentas de usuario, base de datos,
modo offline, parseo de los PDFs del boletín diario de condiciones oceanográficas, alertas push,
pantalla de ajustes, LLM.

## 3. Arquitectura

```
Open-Meteo (CORS abierto) ───────────► navegador (site/)
  oleaje, periodo, viento por playa,     │  calcula el semáforo al abrir la página
  consultado al abrir la página          │
                                         ▲ lee data/dhn.json
GitHub Actions (job/): scraper + parser del DHN
  · cron diario ~05:30 hora de Lima
  · workflow_dispatch (botón "Run workflow" a demanda)
  · reescribe y commitea data/dhn.json cada vez (así generadoEn siempre refleja la última lectura)
GitHub Pages sirve site/ y data/
```

Razón del reparto: el sitio del DHN no permite lecturas desde el navegador (CORS), así que su parte
pasa por el job. Open-Meteo sí lo permite, así que el mar se consulta en vivo y el semáforo siempre usa
datos del momento. No hay proxies públicos ni claves.

Decisiones tomadas:
- Un solo ejecutor en la nube: GitHub Actions + Pages. Alternativa equivalente: cron en la VPS + nginx.
- Sin botón en la página que dispare el workflow (exigiría un token de GitHub en una página pública).
- Node.js (JS plano en el front, sin build, sin framework).
- Repositorio propio (Pages y Actions lo requieren). **Pendiente confirmar** nombre y ubicación; esta
  carpeta hoy cuelga del git de `D:\Desarrollo`.
- GitHub desactiva crons tras 60 días sin actividad en el repo. El job hace commit cuando sale un
  aviso nuevo, lo que normalmente lo mantiene activo; si se pausa, se reactiva a mano.

## 4. Fuentes de datos

| Dato | Fuente | Acceso |
|---|---|---|
| Aviso especial de oleaje | `https://www.dhn.mil.pe/portal/` (aviso vigente) y `.../portal/avisos-especiales/<id>` | HTML, desde el job |
| Boletines sismo/tsunami | `https://www.dhn.mil.pe/portal/boletin-sismo-tsunami` | HTML, desde el job |
| Oleaje (altura, periodo, dirección) | `https://marine-api.open-meteo.com/v1/marine` | JSON, desde el navegador |
| Viento (velocidad, dirección) | `https://api.open-meteo.com/v1/forecast` | JSON, desde el navegador |
| Boletín diario oceanográfico, dashboards | páginas del DHN | solo enlace (PDF / respuesta vacía) |

Ambas fuentes del DHN se verificaron el 2026-10-09 (HTTP 200, texto legible).

Estructura observada del aviso de oleaje (nº 39-26, "Válido del 08 al 12 de octubre"):
- Tramos: Litoral Norte (Tumbes–Salaverry), Litoral Centro (Salaverry–San Juan de Marcona, con
  subtramos), Litoral Sur.
- **Los límites de los subtramos cambian entre avisos** (el 38 dividía en Chancay, el 39 en Callao). El
  parser los lee de cada aviso; no los asume.
- Cada tramo trae una línea de tiempo: nivel (ligero/moderado/fuerte/muy fuerte) con momentos como
  "desde la noche del mismo día", "desde la tarde del viernes 09 de octubre". Verbos varían
  ("Arribo", "Persistencia", "incrementando a", "decreciendo a").
- Escala: normal; ligero (hasta +50 %), moderado (hasta el doble), fuerte (2–3 veces), muy fuerte (>3).
- Incluye fase lunar y fecha de emisión ("Callao, 07 de octubre 2026").

Sismo/tsunami: cada boletín trae número, fecha/hora local, lugar, magnitud y una conclusión. La
conclusión "NO GENERA TSUNAMI EN LITORAL PERUANO" es la frase que marca un evento sin riesgo.

## 5. Asignación playa → tramo

Las coordenadas son aproximadas y se confirman al implementar.

| Playa | Tramo del aviso |
|---|---|
| La Punta (Callao) | "hasta Callao" (el límite exacto lo lee el parser) |
| San Bartolo, Punta Hermosa, Yuyos | "al sur de Callao" |

Open-Meteo usa una malla gruesa (la consulta de prueba a San Bartolo devolvió el punto -12,375/-76,792).
Es probable que San Bartolo, Punta Hermosa y Yuyos caigan en la misma celda y muestren los mismos
valores de ola; se diferenciarán por viento, si la malla del viento lo permite, y por el tramo DHN.
La página lo declara en una nota.

## 6. Criterio de "buen día" (remo en mar calmo, nivel intermedio)

Se evalúa cada hora entre 06:00 y 17:00 (la última hora evaluada es la de las 16:00; un bloque puede terminar a las 17:00). El color de la hora es el **peor** de los factores. La página
muestra, por playa, el mejor bloque de 2 h o más seguidas y el motivo en una línea.

| Factor | Verde | Amarillo | Rojo |
|---|---|---|---|
| Altura de ola (Hs) | ≤ 0,8 m | 0,8 – 1,3 m | > 1,3 m |
| Periodo | cualquiera si Hs ≤ 0,6 m; si no, ≤ 12 s | 12 – 14 s con Hs > 0,6 m | > 14 s con Hs > 0,8 m |
| Viento | ≤ 12 km/h | 12 – 20 km/h | > 20 km/h |
| Viento terral (dirección 20°–160°) | ≤ 8 km/h | 8 – 15 km/h | > 15 km/h |
| Nivel DHN del tramo en esa hora | normal / ligero | moderado | fuerte / muy fuerte |

- El aviso del DHN actúa como **tope**: con "moderado" en el tramo la hora no pasa de amarillo.
- El terral tiene umbrales más estrictos porque empuja a quien se cae hacia mar abierto.
- Los umbrales viven en `site/config.json` y se calibran con salidas reales (los valores de Open-Meteo
  son de modelo, no medidos en orilla; las bahías protegidas suelen tener menos ola que el dato).

### Override de tsunami

- Por cada evento sísmico (p. ej. `28-2026`) vale solo el boletín de mayor versión (`-2` reemplaza a `-1`).
- Boletín de sismo/tsunami de las últimas 24 h **sin** la frase "NO GENERA TSUNAMI EN LITORAL PERUANO":
  banner rojo y todas las playas en rojo.
- Con esa frase: línea informativa gris ("Sismo 7,6 Mw Panamá: sin tsunami en el litoral peruano").
- Algunos boletines (los de alerta, p. ej. el real `31-2025-5`) no traen "El día … hora local": sin fecha, la
  vigencia se cuenta desde que el job lo vio por primera vez (`vistoEn`), y los de años anteriores se descartan.
- Texto no reconocible: se trata como alerta y se muestra el texto crudo (mejor falso positivo que falso
  negativo).
- La página muestra la hora de la última corrida del job y recomienda revisar dhn.mil.pe o la app MGP
  Tsunamis antes de salir. **No es un sistema de alerta en tiempo real.**

## 7. Contrato `data/dhn.json`

```json
{
  "generadoEn": "2026-10-09T10:31:00Z",
  "parseError": false,
  "aviso": {
    "numero": "39-26", "emitidoEn": "2026-10-07",
    "validoDesde": "2026-10-08", "validoHasta": "2026-10-12",
    "url": "https://www.dhn.mil.pe/portal/avisos-especiales/5340",
    "tramos": [
      { "nombre": "Al sur de Callao hasta San Juan de Marcona",
        "desde": "Callao", "hasta": "San Juan de Marcona",
        "linea": [ { "nivel": "ligero", "desde": "2026-10-07T00:00-05:00" },
                   { "nivel": "moderado", "desde": "2026-10-07T12:00-05:00" },
                   { "nivel": "ligero", "desde": "2026-10-09T12:00-05:00" } ] }
    ],
    "faseLunar": "cuarto menguante",
    "textoCrudo": "…"
  },
  "tsunami": [
    { "numero": "28-2026-2", "fechaLocal": "2026-10-09T12:56:00-05:00",
      "lugar": "59 KM WSW OF LAS TABLAS, PANAMA", "magnitud": 7.6,
      "generaTsunamiEnPeru": false, "textoCrudo": "…" }
  ]
}
```

Campos añadidos al implementar: `avisoCrudo` ({titulo, texto, url, motivo}, cuando `parseError` es true),
`evento` y `version` de cada boletín, y `vistoEn` (ISO) para medir la vigencia de boletines sin fecha.
El plan define el contrato definitivo y el job lo valida antes de escribirlo.
Mapeo de momentos relativos a horas: madrugada 00:00, mañana 06:00, tarde 12:00, noche 18:00;
el plan fija los valores definitivos y los cubre con pruebas.

## 8. Interfaz

Móvil primero, una pantalla; HTML/CSS/JS planos; tema claro/oscuro automático; semáforo con texto e
ícono (no solo color); PWA instalable sin modo offline.

- Banner de alerta (solo si corresponde: tsunami o DHN fuerte/muy fuerte).
- Pestañas Hoy / Mañana / Pasado (Hoy por defecto).
- "Mejor opción" del día: playa y bloque horario.
- Una tarjeta por playa con su mejor bloque; al tocarla se abre la franja 06–17 h con color por hora y
  los valores (ola, periodo, viento).
- Pie: aviso DHN vigente (número, validez, nivel), línea de sismo/tsunami, hora de la última corrida del
  DHN y hora de la consulta del mar, enlace al aviso y a los dashboards del DHN.

## 9. Errores y degradación

Principio: nunca mostrar un verde sin respaldo.

| Falla | Comportamiento |
|---|---|
| Open-Meteo no responde | Sin semáforo ("No pude obtener el mar ahora"); se muestra solo el aviso DHN. |
| `dhn.json` ausente o con más de 36 h | Semáforo con tope amarillo y banner "Sin aviso DHN reciente, revisa dhn.mil.pe". |
| Parser no entiende un aviso de oleaje | El job conserva el último `dhn.json` válido, marca `parseError: true` y guarda el texto crudo; la página lo muestra con tope amarillo. |
| Boletín de tsunami no reconocible | Se trata como alerta. |
| El job falla en Actions | Correo de GitHub; la página lo percibe como `dhn.json` desactualizado. |
| El tramo del aviso no incluye una playa | Esa playa con tope amarillo y mensaje explícito. |

## 10. Pruebas

- Parser y scorer con pruebas automáticas sobre avisos reales guardados en `tests/fixtures/` (avisos
  38 y 39, boletines de sismo, y casos adversos con redacción nueva).
- Scorer con casos tabulares, incluidos los límites exactos (0,8 m; 12 km/h; etc.).
- Humo del job: si el parser produce un JSON inválido, el job falla en vez de publicar.
- Sin pruebas de interfaz automatizadas; revisión manual en el navegador al terminar.

## 11. Estructura del repo

```
boletin-olas/
  site/   index.html, app.js, style.css, config.json, manifest.json
  job/    scrape.js, parse-aviso.js, parse-tsunami.js, run.js
  data/   dhn.json
  tests/  fixtures/, parse.test.js, score.test.js
  .github/workflows/dhn.yml   (cron diario + workflow_dispatch)
```

## 12. Riesgos abiertos

- El texto del DHN es lo más frágil: el parser puede fallar con una redacción nueva (mitigado por el
  fallback a texto crudo y el tope amarillo).
- Datos de modelo sin validar contra la realidad de cada playa (mitigado por umbrales editables y
  calibración con salidas reales).
- Las coordenadas de las playas y la asignación exacta de La Punta al tramo "hasta Callao" se confirman
  al implementar.
- El job puede quedar pausado por inactividad (ver §3).
