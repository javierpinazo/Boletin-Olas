# Despliegue en la VPS PayHub (olas.veripago.pe)

Sigue `VPS-DIRECTRICES-DESPLIEGUE.md`, con **una desviación documentada**: el job corre en el **host con Node 22**
(ya instalado en `/usr/bin/node`), no en Docker. Motivo: es un script de unos segundos cada hora, no un servicio
residente, y el disco estaba al 81 % (una imagen `node:22-alpine` sumaría ~150 MB). No abre puertos: nginx del host
sirve una carpeta estática.

```
n8n (contenedor, red veripago_payhub)
  └─ Cada hora ──SSH──▶ 172.18.0.1:22 (host) ── llave con comando forzado ──▶ actualizar.sh
                                                  ├─ node job/run.js         → data/dhn.json
                                                  └─ node scripts/build-site → /opt/boletin-olas/_site
nginx del host  olas.veripago.pe ──▶ root /opt/boletin-olas/_site
navegador ──▶ Open-Meteo (oleaje, viento, mareas) en vivo
```

## Archivos

| Archivo | Para qué |
|---|---|
| `actualizar.sh` | Lectura horaria del DHN + armar el sitio. Lo ejecuta n8n. Una sola corrida a la vez (`flock`). |
| `actualizar-codigo.sh` | Actualiza el código (`git pull --ff-only` + pruebas + build). **A mano**, nunca desde n8n. |
| `nginx-olas.veripago.pe.conf` | Server block (solo GET/HEAD, CSP, `no-cache`). |
| `n8n-boletin-olas.json` | Flujo: Cada hora → SSH → ¿falló? → marcar ejecución fallida. |
| `n8n-boletin-olas-avisos.json` | Flujo de error: avisarte (conecta tu Telegram/correo en el último nodo). |

## Instalación (una vez)

1. **Disco y RAM** antes de empezar (checklist §9.8): `df -h /` y `free -h`; el disco debe estar bajo el 75 %.
2. **Código:** `git clone https://github.com/javierpinazo/Boletin-Olas.git /opt/boletin-olas` (repo público, sin credenciales).
3. **Primera corrida a mano:** `/opt/boletin-olas/deploy/vps/actualizar.sh` debe terminar con `OK …` y dejar
   `/opt/boletin-olas/_site/data/dhn.json`.
4. **DNS:** registro `A` de `olas.veripago.pe` hacia la IP de la VPS (lo creas tú donde administras `veripago.pe`).
5. **nginx** (como root/sudo):
   ```bash
   sudo cp /opt/boletin-olas/deploy/vps/nginx-olas.veripago.pe.conf /etc/nginx/sites-available/olas.veripago.pe
   sudo ln -s /etc/nginx/sites-available/olas.veripago.pe /etc/nginx/sites-enabled/olas.veripago.pe
   sudo nginx -t && sudo systemctl reload nginx
   sudo /opt/certbot-venv/bin/certbot --nginx -d olas.veripago.pe     # TLS con el certbot del host
   ```
6. **Llave SSH para n8n** (solo puede ejecutar `actualizar.sh`, sin shell ni reenvío de puertos):
   ```bash
   ssh-keygen -t ed25519 -N '' -C 'n8n-boletin-olas' -f ~/.ssh/n8n-boletin-olas
   { printf 'command="/opt/boletin-olas/deploy/vps/actualizar.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding '; cat ~/.ssh/n8n-boletin-olas.pub; } >> ~/.ssh/authorized_keys
   cat ~/.ssh/n8n-boletin-olas        # cópiala a la credencial de n8n y luego bórrala del servidor
   shred -u ~/.ssh/n8n-boletin-olas
   ```
7. **n8n:** Credentials → *SSH* (tipo clave privada): host `172.18.0.1`, puerto `22`, usuario `PayHub`, la llave del
   paso anterior. Importa `n8n-boletin-olas.json`, elige esa credencial en el nodo SSH, **Execute workflow** para probar
   y activa el flujo. Importa también `n8n-boletin-olas-avisos.json` y, en *Settings* del flujo principal,
   elígelo como *Error Workflow*.

## Operación

- **Actualizar el código:** `ssh PayHub@servidor /opt/boletin-olas/deploy/vps/actualizar-codigo.sh`.
- **Ver que funciona:** `curl -s https://olas.veripago.pe/data/dhn.json | head -3` y mira `generadoEn` (debe ser de hace
  menos de una hora). La propia página avisa con un banner amarillo si los datos pasan de 3 h.
- **Si el DHN no responde:** el script falla, n8n marca la ejecución como fallida y el sitio sigue sirviendo el último
  `dhn.json`. No hay que hacer nada.
- **Quitarlo:** desactivar el flujo en n8n, borrar la línea de `authorized_keys` que dice `n8n-boletin-olas`, y
  `sudo rm /etc/nginx/sites-enabled/olas.veripago.pe && sudo systemctl reload nginx`.

## Estado y notas (2026-10-10)

- DNS: `olas` (A → IP de la VPS) en Cloudflare, con proxy. Certificado emitido con el certbot del host
  (vence el 2027-01-08; lo renueva el cron diario ya existente).
- Cloudflare va por delante: tras un despliegue (`actualizar-codigo.sh`) puede tardar unos minutos en llegar la
  versión nueva a todos los navegadores; con **Ctrl+F5** se fuerza. Los datos (`data/dhn.json`) van con `no-store`.
- Mientras el flujo de n8n no esté activo, `dhn.json` solo se actualiza al ejecutar `actualizar.sh` o
  `actualizar-codigo.sh` a mano, y la página mostrará el banner de "datos del DHN con más de 3 horas".
