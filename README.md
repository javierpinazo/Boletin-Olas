# Boletín Olas

¿Es buen día para remar en mar calmo? Cada remero elige sus playas de un catálogo del litoral peruano.

- **Qué hace:** lee el aviso de oleaje y los boletines de sismo/tsunami del DHN (job diario) y consulta oleaje y viento por playa en Open-Meteo (en vivo, desde el navegador). Muestra un semáforo por playa y por hora (06–17 h).
- **Diseño:** `docs/superpowers/specs/2026-10-09-boletin-olas-design.md`
- **Umbrales:** `site/config.json` (umbrales del semáforo, ráfagas, ventana y grifos).
- **Playas:** `site/playas.json` (catálogo y zonas de temperatura del mar).

## Catálogo y "Mis playas"

- Quien no ha elegido ve las 4 de Lima y Callao, con un aviso para elegir las suyas.
- Cada remero elige hasta 6 playas (por nombre, región o "Cerca de mí"). Quedan en su navegador; su ubicación no se
  guarda ni se envía.
- **Agregar una playa:** añádela en `site/playas.json` (de norte a sur) con `id` nuevo, `region`, coordenadas en la
  orilla, `orientacion` (grados hacia donde mira el mar), `zonaTemp` y `verificada: false`. Si queda al norte de
  -3,57 o al sur de -18,0 de latitud, pon `latTramo` con ese límite. Luego `npm test` y
  `node scripts/verificar-catalogo.mjs`.
- **Verificarla:** cuando alguien que rema ahí confirme ubicación y orientación, cambia a `verificada: true`. La
  orientación inicial se calculó con la línea de costa y puede diferir varias decenas de grados de la zona de remo.
- Las playas sin `factorOla` usan la ola completa del modelo ("Sin calibrar") hasta tener 3 salidas.
- Ubicaciones: © colaboradores de OpenStreetMap (ODbL).

## Calibración con tus salidas

El modelo da la ola de mar abierto; en la zona tranquila donde remas suele ser mucho menor. Yuyos, La Punta,
Punta Hermosa y San Bartolo traen un `factorOla` de 0,31 en el catálogo; las demás no tienen factor.

1. Al volver de remar, abre la tarjeta de la playa (pestaña **Hoy**) y marca cómo estaba el mar (Plano, Olitas, Con olas, No se podía remar) **y el viento** (Calmo, Moderado, Fuerte, Muy fuerte).
2. Con 3 o más salidas en una playa, la app calcula sus factores de ola y de viento (mediana de lo que viste / lo que decía el modelo) y los usa en lugar de los del catálogo. El factor de viento corrige también las ráfagas. La tarjeta dice cuáles está usando y la tabla muestra, en gris, el valor original del modelo.
3. Las salidas se guardan en el navegador. **Exporta** de vez en cuando (panel "Tus salidas") e **importa** el archivo en otro navegador o celular.

`npm run valores` imprime la ola, el periodo y el viento del modelo por playa para comparar a mano.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run hoy` | **Un solo paso antes de salir:** lee el DHN, arma el sitio, lo sirve y abre el navegador (Ctrl+C para cerrar). Los datos del servidor se piden a la VPS |
| `npm run probar` | Prueba solo local: genera los datos en tu PC y sirve en http://localhost:8080 sin llamar a la VPS |
| `npm test` | Pruebas (parsers sobre HTML real del DHN, scorer, Open-Meteo) |
| `npm run dhn` | Lee el DHN y escribe `data/dhn.json` |
| `npm run build` | Arma `_site/` (sitio + `dhn.json`) |
| `npm run serve` | Sirve `_site/` en http://localhost:8080 |
| `npm run valores` | Imprime ola/periodo/viento de hoy por playa, para calibrar |

## Dónde corre

- **Producción: la VPS, en https://olas.veripago.pe.** n8n lanza cada hora `deploy/vps/actualizar.sh` (lee el DHN y arma
  el sitio) y nginx sirve la carpeta estática. Instalación, operación y cómo actualizar el código:
  [`deploy/vps/README.md`](deploy/vps/README.md). Los datos (`data/`) **no se versionan**: viven en cada servidor.
- **En tu PC:** `npm run hoy`.
- **GitHub Pages (opcional):** el workflow `Publicar` ya no se programa ni commitea nada; solo corre a mano (**Actions →
  Publicar → Run workflow**) y requiere **Settings → Pages → Source: GitHub Actions**. No lo actives si no lo necesitas:
  la página publicada ahí solo se actualizaría cuando lo lances tú.

## Importante

Es una ayuda para decidir, no un permiso de seguridad. Los datos de oleaje son de modelo (no medidos en la orilla). Antes de salir revisa dhn.mil.pe o la app MGP Tsunamis; manda lo que veas en la orilla y cualquier cierre de puerto.
