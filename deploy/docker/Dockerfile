# =============================================================================
# Identity Radar — Production Dockerfile
# Multi-stage build: deps → builder → runner
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build requires DATABASE_URL at compile time for Drizzle schema imports.
# This is a dummy value used only during `next build`; the real URL is
# injected at runtime via environment variables.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runner
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="Identity Radar"
LABEL org.opencontainers.image.description="AI-powered IAM posture management platform"
LABEL org.opencontainers.image.source="https://github.com/ASHS21/IDR-C"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migrations + seed (db/) and the schema (src/lib) for runtime migration support
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/src/lib ./src/lib
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# Scheduler for /api/cron/* jobs (runs as its own container from this image)
COPY --chown=nextjs:nodejs deploy/docker/scheduler.mjs ./scheduler.mjs

# Install only the runtime deps needed for migrations (tsx, drizzle-kit, etc.)
COPY --from=deps /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# Stage 4: Init container (schema push + views + seed)
# Used as a one-shot service in docker-compose to initialise the database.
# Retains full node_modules (drizzle-kit, tsx) needed for migrations.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS init
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache postgresql16-client

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/db ./db
COPY --from=builder /app/src/lib ./src/lib
COPY deploy/docker/init-db.sh /init-db.sh
RUN chmod +x /init-db.sh

ENTRYPOINT ["/init-db.sh"]
