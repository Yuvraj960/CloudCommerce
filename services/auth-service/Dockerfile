# Multi-stage Docker build for auth-service (npm workspaces monorepo)
#
# Usage: docker build -f services/auth-service/Dockerfile -t auth-service:local .

# ── Stage 1: install deps and build ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy entire monorepo for npm workspace support
COPY package*.json tsconfig*.json ./
COPY packages/ packages/
COPY services/ services/

RUN npm ci

# Build common library first (required by auth-service), then compile TS
RUN npm run build --workspace=packages/common
RUN npx tsc -p services/auth-service/tsconfig.json

# ── Stage 2: minimal production image ────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/services/auth-service/dist ./services/auth-service/dist
COPY --from=build /app/packages/common/dist   ./packages/common/dist

# Copy root node_modules (hoisted by npm workspaces — one flat tree)
COPY --from=build /app/node_modules ./node_modules

# Fix: @cloudcommerce/common symlink points to ../../packages/common (sources only).
# Overwrite the symlink with the actual built dist files so Node finds .js there.
RUN rm -rf /app/node_modules/@cloudcommerce/common && \
    cp -r /app/packages/common/dist /app/node_modules/@cloudcommerce/common

RUN apk add --no-cache dumb-init

EXPOSE 3001
WORKDIR /app/services/auth-service

ENV NODE_ENV=production \
    PORT=3001

ENTRYPOINT ["dumb-init", "node", "dist/index.js"]