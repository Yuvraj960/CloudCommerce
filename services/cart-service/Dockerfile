# Multi-stage Docker build for cart-service (npm workspaces monorepo)
#
# Usage: docker build -f services/cart-service/Dockerfile -t cart-service:local .

# ── Stage 1: install deps and build ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy entire monorepo for npm workspace support
COPY package*.json tsconfig*.json ./
COPY packages/ packages/
COPY services/ services/

RUN npm ci

# Build common library first (required by cart-service), then compile TS
RUN npm run build --workspace=packages/common
RUN npx tsc -p services/cart-service/tsconfig.json

# ── Stage 2: minimal production image ────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=build /app/services/cart-service/dist ./services/cart-service/dist
COPY --from=build /app/packages/common/dist   ./packages/common/dist

# Copy root node_modules (hoisted by npm workspaces — one flat tree)
COPY --from=build /app/node_modules ./node_modules

# Fix: @cloudcommerce/common symlink points to ../../packages/common (sources only).
# Overwrite the symlink with the actual built dist files so Node finds .js there.
RUN rm -rf /app/node_modules/@cloudcommerce/common && \
    cp -r /app/packages/common/dist /app/node_modules/@cloudcommerce/common

RUN apk add --no-cache dumb-init

EXPOSE 3003
WORKDIR /app/services/cart-service

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init", "node", "dist/index.js"]