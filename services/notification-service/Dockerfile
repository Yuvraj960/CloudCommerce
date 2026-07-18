# Multi-stage Docker build for notification-service (npm workspaces monorepo)
#
# Usage: docker build -f services/notification-service/Dockerfile -t notification-service:local .

# ── Stage 1: install deps and build ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy entire monorepo for npm workspace support
COPY package*.json tsconfig*.json ./
COPY packages/ packages/
COPY services/ services/

RUN npm ci          # install all workspace deps at root (hoisted by npm workspaces)

# Build common library first (required by notification-service), then compile TS
RUN npm run build --workspace=packages/common
RUN npx tsc -p services/notification-service/tsconfig.json

# ── Stage 2: minimal production image ────────────────────────────────────────
# npm workspaces hoists all node_modules to root /app/node_modules
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=build /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=build /app/packages/common/dist   ./packages/common/dist

# Copy root node_modules (hoisted by npm workspaces — one flat tree)
COPY --from=build /app/node_modules ./node_modules

# Fix: @cloudcommerce/common symlink points to ../../packages/common (sources only).
# Overwrite the symlink with the actual built dist files so Node finds .js there.
RUN rm -rf /app/node_modules/@cloudcommerce/common && \
    cp -r /app/packages/common/dist /app/node_modules/@cloudcommerce/common

RUN apk add --no-cache dumb-init

EXPOSE 3006
WORKDIR /app/services/notification-service

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init", "node", "dist/index.js"]