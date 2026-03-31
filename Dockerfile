# ── Build stage ──
FROM node:20-alpine AS builder
ARG CACHE_BUST=2

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json ./
COPY packages/core/package.json packages/core/

# Install dependencies (better-sqlite3 needs native build)
RUN apk add --no-cache python3 make g++ && \
    npm ci --workspace=packages/core

# Copy source
COPY packages/core/ packages/core/

# Build
RUN npm run build -w packages/core

# ── Runtime stage ──
FROM node:20-alpine

WORKDIR /app

# Copy only what's needed
COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY --from=builder /app/packages/core/static/ packages/core/static/
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/node_modules/ node_modules/
COPY package.json ./

ENV HELIX_PORT=7842
ENV HELIX_MODE=observe
ENV NODE_ENV=production

EXPOSE 7842

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:7842/health || exit 1

CMD ["node", "packages/core/dist/cli.js", "serve", "--port", "7842", "--mode", "observe"]
