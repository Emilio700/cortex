#!/bin/sh
# Calcula la fuente exacta de onnxruntime-web en jsDelivr (Whisper en el navegador) para la CSP.
# CSP_ORT_SRC=off la quita. Si ya viene definida, se respeta.
set -eu
if [ -z "${CSP_ORT_SRC:-}" ] && [ -s /etc/caddy/ort-version ]; then
  CSP_ORT_SRC="https://cdn.jsdelivr.net/npm/onnxruntime-web@$(cat /etc/caddy/ort-version)/dist/"
fi
[ "${CSP_ORT_SRC:-}" = "off" ] && CSP_ORT_SRC=""
export CSP_ORT_SRC="${CSP_ORT_SRC:-}"
exec "$@"
