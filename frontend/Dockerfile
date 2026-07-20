# Multi-stage Docker build for frontend (root workspace — Vite + React + Tailwind)
#
# Usage: docker build -f frontend/Dockerfile -t frontend:local .

# ── Stage 1: install deps and build ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy entire monorepo for npm workspace support
COPY package*.json tsconfig*.json ./
COPY packages/ packages/
COPY frontend/  frontend/

RUN npm ci

# Build common library first (needed by frontend workspace), then build frontend
RUN npm run build --workspace=packages/common
RUN npm run build --workspace=frontend

# ── Stage 2: minimal production image ────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/packages/common/dist ./packages/common/dist

# Copy root node_modules (hoisted by npm workspaces)
COPY --from=build /app/node_modules ./node_modules

# Restore @cloudcommerce/common — symlink points to ../../packages/common (sources only)
RUN rm -rf /app/node_modules/@cloudcommerce/common && \
    cp -r /app/packages/common/dist /app/node_modules/@cloudcommerce/common

# Install vite globally for preview server (lightweight compared to all dev deps)
RUN npm install -g vite

EXPOSE 5173
WORKDIR /app/frontend

# VITE_API_URL is baked in at build time; override with --build-arg for different backends
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

ENTRYPOINT ["vite", "preview", "--host", "0.0.0.0", "--port", "5173"]