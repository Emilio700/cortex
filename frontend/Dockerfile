# Multi-stage Dockerfile for React Frontend (Vite)

# Build stage
# pdfjs-dist 5 (visor de PDF del plan 26) pide node >= 22.13.
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files and install the exact audited dependency tree.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# VITE_* variables are inlined into the JS bundle at build time (not
# read at runtime like a normal env var), so it has to arrive as a build
# arg here rather than as a docker-compose `environment:` entry on the
# production (nginx) stage below.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build the application
RUN npm run build

# Development stage
FROM node:22-alpine AS development

WORKDIR /app

# Keep development containers reproducible too.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code (will be overridden by volume in docker-compose)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# Production stage
FROM nginx:alpine AS production

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
