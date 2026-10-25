# syntax=docker/dockerfile:1
# Imagen "web" de MediSuite: compila el frontend (Vite) y lo sirve con Caddy.
#   docker build -t medisuite-web .
#   docker run -p 8080:8080 medisuite-web        → http://localhost:8080 (sin TLS; ponla detrás de HTTPS)
#   docker build --build-arg VITE_MODE=server …  → producción: siempre exige la API (nunca cae a modo demo)

# ---------- 1) Compilación ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig*.json ./
COPY public ./public
COPY src ./src
# VITE_MODE=server: sin respaldo al modo demo local si la API no responde (deploy/docker-compose.yml lo fija).
# Vacío = detección automática con /api/health (imagen de demostración sin API).
ARG VITE_MODE=""
ENV VITE_MODE=${VITE_MODE}
RUN npm run build \
 && node -p "require('./node_modules/onnxruntime-web/package.json').version" > /app/ort-version

# ---------- 2) Precompresión (zstd + gzip junto a cada archivo de texto/WASM) ----------
FROM alpine:3.22 AS compress
RUN apk add --no-cache zstd gzip
COPY --from=build /app/dist /srv
# No se tocan *.gz existentes (spa.traineddata.gz se sirve tal cual) ni modelos binarios.
RUN find /srv -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' -o -name '*.svg' \
      -o -name '*.json' -o -name '*.webmanifest' -o -name '*.wasm' -o -name '*.map' -o -name '*.txt' \) -size +1k \
      -exec gzip -9 -k -n {} \; -exec zstd -19 -q {} \;

# ---------- 3) Servidor ----------
FROM caddy:2.11-alpine
COPY --from=compress /srv /srv
COPY --from=build /app/ort-version /etc/caddy/ort-version
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY deploy/web/security-headers.caddy /etc/caddy/security-headers.caddy
COPY --chmod=0755 deploy/web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
 && chown -R 65532:65532 /data /config
ENV WEB_PORT=8080 \
    API_UPSTREAM=api:3000
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
