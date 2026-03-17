# ─── Stage 1: Dependencies ─────────────────────────────────────
FROM node:20.18-alpine3.20 AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─── Stage 2: Build ────────────────────────────────────────────
FROM node:20.18-alpine3.20 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build-time env placeholders — real values come from runtime env
ENV ANTHROPIC_API_KEY=""
ENV AUTH_SECRET="build-placeholder"
ENV AUTH_GOOGLE_ID=""
ENV AUTH_GOOGLE_SECRET=""
ENV ALLOWED_EMAIL=""
ENV DATABASE_URL=""

RUN npm run build

# ─── Stage 3: Production ──────────────────────────────────────
FROM node:20.18-alpine3.20 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy migration files
COPY --from=builder /app/src/lib/db/schema.sql ./src/lib/db/schema.sql

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
