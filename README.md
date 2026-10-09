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
