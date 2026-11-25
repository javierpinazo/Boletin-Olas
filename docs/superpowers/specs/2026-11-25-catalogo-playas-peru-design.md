# Catálogo de playas del Perú y "Mis playas"

Fecha: 2026-11-25 · Estado: pendiente de aprobación · Tamaño: proyecto

## Intención

Que remeros de todo el Perú usen Boletín Olas **a diario** con sus propias playas. Hoy la app solo muestra
Yuyos, La Punta, Punta Hermosa y San Bartolo.

## Objetivos

- Elegir playas de un catálogo del litoral peruano, por nombre o región, o por cercanía con el GPS.
- Guardar "Mis playas" en el celular; al abrir la app se ven directamente.
- Que dos remeros de la misma playa partan de la misma ficha (misma ubicación y orientación).
- Que el semáforo no aparente una precisión que no tiene en playas nuevas.

## No objetivos

- Cuentas, base de datos, catálogo editable por usuarios o calibraciones compartidas (opción C, a futuro).
- Que el remero cree puntos libres en el mapa.
- Playas fuera del Perú, lagos o ríos.
- Mapa interactivo o buscador externo de lugares.

## Sería un fracaso si

- Una playa nueva sale en verde por usar un factor de ola calibrado para otra.
- Un usuario actual pierde sus playas o sus salidas registradas.
- La actualización del servidor se vuelve lenta o falla por tener más playas.
- La ubicación del remero sale de su celular.

## Restricciones

- Sitio estático sin framework ni dependencias nuevas; mismo CSP (no se agrega ningún dominio).
- Texto remoto siempre con `textContent`.
- El semáforo (`score.js`) no cambia sus reglas ni sus umbrales.
- Debe seguir abriendo sin conexión con lo último consultado.
- Las pruebas actuales siguen pasando (adaptadas donde lean `config.playas`).

## Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| A. Cualquier punto (buscador/GPS) | Rápido, sin lista que mantener | Sin orientación; resultados que no son playas; fichas distintas para la misma playa |
| **B. Catálogo propio + "Mis playas"** (elegido) | Fichas consistentes, búsqueda sin servicios externos, funciona sin conexión | Hay que armar, verificar y mantener la lista |
| C. Catálogo comunitario | Mejora con el uso | Base de datos, moderación y probablemente cuentas |

Se eligió **B** por dar una base consistente para el uso diario sin cerrar el paso a C.

## Diseño

### 1. Catálogo (`site/playas.json`)

Un archivo versionado. Por playa: `id` (estable, no se reutiliza), `nombre`, `region`, `lat`, `lon`,
`orientacion` (grados hacia donde mira el mar), `zonaTemp`, `verificada` (sí/no) y, opcionales,
`factorOla` y `latTramo`. `config.json` deja de tener `playas` y conserva umbrales, ventana, grifos y firma.

- Las 4 actuales pasan al catálogo con los **mismos `id` y valores** (así se conservan las salidas).
- Cobertura inicial: las playas y caletas donde sea razonable remar, en las regiones costeras de Tumbes a Tacna.
- El borrador sale de fuentes abiertas (OpenStreetMap, con su atribución). Las playas nuevas entran con
  `verificada: false` y la tarjeta dice "Ubicación y orientación sin verificar por remeros de la zona".
  Se marca verificada cuando alguien que rema ahí la confirma.
- Una prueba exige: `id` único, campos completos, coordenadas dentro del Perú, orientación 0–359, que el
  modelo marino tenga datos (comprobación manual con un script, no en `npm test`) y que cada playa caiga en un
  tramo del DHN. Las que queden al norte de la latitud usada para Tumbes llevan `latTramo`.

### 2. Mis playas

- Lista de `id` en el navegador. Máximo **6**. La imagen para compartir hoy tiene espacio para 4: con 5 o 6
  usa filas compactas (nombre, color y horario, sin las cifras de ola y viento).
- Se puede agregar, quitar y reordenar. Un `id` guardado que ya no exista en el catálogo se ignora.
- **Usuario actual** (tiene salidas o datos guardados de la app y ninguna lista): empieza con las 4 de hoy.
- **Usuario nuevo:** ve la pantalla "Agrega tu playa"; no se asume ninguna. Las alertas de tsunami y el aviso
  de datos del DHN desactualizados se muestran aunque no tenga playas.
- Si no se puede guardar (modo privado), la selección dura mientras la página esté abierta y se avisa.

### 3. Agregar playa

```
Agregar playa
  [ Buscar por nombre o región…  ]   [📍 Cerca de mí]
  Huanchaco · La Libertad                    [+]
  Pacasmayo · La Libertad                    [+]
```

- La búsqueda ignora tildes y mayúsculas. Sin texto, lista por región de norte a sur.
- **Cerca de mí:** pide ubicación solo al tocar el botón; muestra las 5 más cercanas con la distancia en línea
  recta. El cálculo es en el celular; la ubicación no se guarda ni se envía.
- Si la playa más cercana está a más de 50 km, se dice. Si el permiso se niega o el GPS falla, se explica y la
  búsqueda por texto sigue disponible.

### 4. Semáforo en playas nuevas

- Sin `factorOla` en el catálogo se usa **1** (ola completa del modelo). Puede salir más restrictivo que la orilla.
- La tarjeta muestra "Sin calibrar" y explica que con 3 salidas se ajusta. La calibración sigue siendo local.
- Las 4 actuales conservan 0,31.

### 5. Textos y secciones

- Titular "mejor opción", cuadro hora a hora, oleaje del DHN y "Comparte el día" usan solo Mis playas.
- Cabecera, descripción, manifest y README dejan de decir "Lima sur y Callao".
- **Grifos:** la sección aparece solo si Mis playas incluye alguna de Lima o Callao. "Tus grifos" pasa a
  "Grifos destacados" y "en tu ruta" a "en las rutas al mar de Lima".

### 6. Temperatura del mar por zonas

- El catálogo define unas **10–14 zonas** de referencia a lo largo de la costa; cada playa apunta a una.
- El job y `clima-mar.json` (habitual 1991–2020) trabajan por zona, no por playa.
- La temperatura se relee como máximo una vez por cada 12 h (el dato es diario) y tiene un plazo total que no
  deja que la actualización supere los 120 s del servicio. Si una zona falla, se conserva su dato anterior y
  las demás se actualizan.
- La pantalla promedia las zonas de Mis playas y dice que es una referencia de la zona, no de la orilla.

### 7. Sin conexión y despliegue

- `playas.json` entra en el service worker con estrategia "primero la red", y sube la versión de la caché.
- No hay cambios de nginx ni de n8n. Se publica con `actualizar-codigo.sh`. Tras desplegar hay que correr el job
  una vez para generar la temperatura por zonas; mientras no exista, el bloque de temperatura se oculta.

## Antes de difundirla (no es código)

- Revisar las condiciones de Open-Meteo: el servicio gratuito es para uso no comercial y tiene límites, y la app
  lleva la firma de Automatizate 360.
- Conseguir remeros de cada zona que confirmen las fichas.

## Queda a criterio de quien construya

Estructura de módulos, estilos (siguiendo el tema actual), orden de implementación y forma exacta de reordenar
Mis playas.

## Decisiones propuestas (revisar)

Máximo de 6 playas; marca "sin verificar"; trato de usuarios actuales y nuevos; textos y visibilidad de
grifos; temperatura por zonas; sin botón "pedir mi playa" en esta versión (falta definir a dónde llegaría el pedido).
