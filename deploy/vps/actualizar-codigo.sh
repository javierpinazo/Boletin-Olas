#!/usr/bin/env bash
# Actualiza el CÓDIGO de la app en la VPS (a mano, por SSH): git pull, pruebas y rearmar el sitio.
# No lo ejecuta n8n: el job horario solo lee datos (actualizar.sh), nunca baja código por su cuenta.
#
#   ssh PayHub@servidor /opt/boletin-olas/deploy/vps/actualizar-codigo.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
export PATH="/usr/local/bin:/usr/bin:/bin"

git fetch origin main
ANTES="$(git rev-parse --short HEAD)"
git merge --ff-only origin/main
DESPUES="$(git rev-parse --short HEAD)"
echo "Código: $ANTES -> $DESPUES"

# Si las pruebas fallan, no se publica nada: _site sigue siendo el de antes.
/usr/bin/node --test
/usr/bin/node scripts/build-site.mjs
echo "OK $(date -u +%Y-%m-%dT%H:%M:%SZ)"
