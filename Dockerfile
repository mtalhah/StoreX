# Storex — production image for Google Cloud Run.
# Multi-stage: deps → build → minimal runtime (Next.js standalone output).

# ---------- 1. Dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. Build ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders only: `prisma generate` needs the config to load and
# Next.js evaluates env wiring during build. No real secrets are baked in —
# runtime values come from Cloud Run env vars / Secret Manager.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    WORKOS_API_KEY="sk_test_build_placeholder" \
    WORKOS_CLIENT_ID="client_build_placeholder" \
    WORKOS_COOKIE_PASSWORD="build-placeholder-cookie-password-32chars" \
    WORKOS_REDIRECT_URI="http://localhost:3000/api/auth/callback" \
    NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npx next build

# ---------- 3. Runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Non-root user (Cloud Run best practice)
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma migration assets so releases can run `prisma migrate deploy`
# (executed as a separate Cloud Run job / release step, not at container boot).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
