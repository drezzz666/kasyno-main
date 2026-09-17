# -------------------------------------------------------------
# 1. Base / Builder stage
# -------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# -------------------------------------------------------------
# 2. Production Runner stage
# -------------------------------------------------------------
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built standalone server and static assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Persistent data directory for SQLite database
RUN mkdir -p /app/data && chmod -R 777 /app/data

EXPOSE 3000

CMD ["node", "server.js"]
