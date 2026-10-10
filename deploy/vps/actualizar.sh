#!/usr/bin/env bash
# Lectura horaria del DHN. Lo lanza n8n por SSH con una llave de comando forzado (ver README.md),
# corre como PayHub en el host y deja el sitio listo en /opt/boletin-olas/_site, que sirve nginx.
#
#   1. job/run.js          lee el aviso de oleaje y los boletines de sismo/tsunami -> data/dhn.json
#   2. scripts/build-site  arma _site/ de forma atómica (nginx nunca ve una carpeta a medias)
#
# Si el DHN no responde, el paso 1 falla y el script termina con error SIN tocar _site: la página sigue
# sirviendo el último dhn.json y avisa sola cuando pasa de 3 h sin actualizarse.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

# Una sola corrida a la vez (si n8n reintenta o una corrida se alarga).
exec 9>/tmp/boletin-olas.lock
if ! flock -n 9; then
  echo "Ya hay una corrida en curso; no hago nada."
  exit 0
fi

export PATH="/usr/local/bin:/usr/bin:/bin"
nice -n 10 /usr/bin/node job/run.js
nice -n 10 /usr/bin/node scripts/build-site.mjs
echo "OK $(date -u +%Y-%m-%dT%H:%M:%SZ)"
