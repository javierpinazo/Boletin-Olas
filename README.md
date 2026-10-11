# Boletín Olas

¿Es buen día para remar en mar calmo en San Bartolo, Punta Hermosa, Yuyos o La Punta?

- **Qué hace:** lee el aviso de oleaje y los boletines de sismo/tsunami del DHN (job diario) y consulta oleaje y viento por playa en Open-Meteo (en vivo, desde el navegador). Muestra un semáforo por playa y por hora (06–17 h).
- **Diseño:** `docs/superpowers/specs/2026-10-09-boletin-olas-design.md`
- **Umbrales y playas:** `site/config.json` (umbrales del semáforo, ráfagas, coordenadas, orientación de cada playa y factor de ola).

## Calibración con tus salidas

El modelo da la ola de mar abierto; en la zona tranquila donde remas suele ser mucho menor. Cada playa tiene un
`factorOla` (hoy 0,31) y una `orientacion` (hacia dónde mira el mar, en grados) en el config.

1. Al volver de remar, abre la tarjeta de la playa (pestaña **Hoy**) y marca cómo estaba el mar (Plano, Olitas, Con olas, No se podía remar) **y el viento** (Calmo, Moderado, Fuerte, Muy fuerte).
2. Con 3 o más salidas en una playa, la app calcula sus factores de ola y de viento (mediana de lo que viste / lo que decía el modelo) y los usa en lugar de los del config. El factor de viento corrige también las ráfagas. La tarjeta dice cuáles está usando y la tabla muestra, en gris, el valor original del modelo.
3. Las salidas se guardan en el navegador. **Exporta** de vez en cuando (panel "Tus salidas") e **importa** el archivo en otro navegador o celular.

`npm run valores` imprime la ola, el periodo y el viento del modelo por playa para comparar a mano.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run hoy` | **Un solo paso antes de salir:** lee el DHN, arma el sitio, lo sirve y abre el navegador (Ctrl+C para cerrar) |
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
