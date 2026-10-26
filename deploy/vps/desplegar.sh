#!/usr/bin/env bash
# Despliega Cortex en el VPS de pruebas sin pasar por GitHub.
#
#   deploy/vps/desplegar.sh [REF]        # REF por omisión: develop
#
# Desde la raíz del repo (Git Bash en Windows sirve). Empaqueta REF con
# `git archive`, le agrega deploy/vps/ del árbol de trabajo (para poder
# desplegar el override antes de integrarlo), lo sube por scp y corre
# deploy/vps/servidor.sh en el VPS.
#
# En el VPS, /opt/cortex se vacía y se vuelve a llenar en cada despliegue,
# salvo .env (secretos) y .atlas/ (atlas generado). Los datos viven en
# volúmenes de Docker y no se tocan.
#
# Variables: VPS (root@2.25.78.44), LLAVE (~/.ssh/cortex_vps_ed25519),
# CON_SEGMENTADOR (1), MIN_DISPONIBLE_MB (500).
set -euo pipefail

REF=${1:-develop}
VPS=${VPS:-root@2.25.78.44}
LLAVE=${LLAVE:-$HOME/.ssh/cortex_vps_ed25519}
SSH=(ssh -i "$LLAVE" -o BatchMode=yes "$VPS")

RAIZ_REPO=$(git rev-parse --show-toplevel)
cd "$RAIZ_REPO"
COMMIT=$(git rev-parse --short "$REF")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== Empaquetando $REF ($COMMIT) + deploy/vps del árbol de trabajo"
git archive --format=tar --prefix=cortex/ "$REF" > "$TMP/cortex.tar"
tar --transform 's#^#cortex/#' -rf "$TMP/cortex.tar" deploy/vps
gzip -9 "$TMP/cortex.tar"

echo "== Subiendo ($(du -h "$TMP/cortex.tar.gz" | cut -f1))"
scp -i "$LLAVE" -o BatchMode=yes -q "$TMP/cortex.tar.gz" "$VPS:/tmp/cortex.tar.gz"

echo "== Desplegando en el VPS"
"${SSH[@]}" "CON_SEGMENTADOR=${CON_SEGMENTADOR:-1} MIN_DISPONIBLE_MB=${MIN_DISPONIBLE_MB:-500} COMMIT=$COMMIT bash -s" <<'REMOTO'
set -euo pipefail
mkdir -p /opt/cortex
chmod 700 /opt/cortex
# Vacía el código anterior, nunca .env ni el atlas generado.
find /opt/cortex -mindepth 1 -maxdepth 1 ! -name .env ! -name .atlas -exec rm -rf {} +
tar -xzf /tmp/cortex.tar.gz -C /opt/cortex --strip-components=1
rm -f /tmp/cortex.tar.gz
echo "$COMMIT" > /opt/cortex/.commit-desplegado
bash /opt/cortex/deploy/vps/servidor.sh
REMOTO
