# ---- Build stage ----
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# ---- Runtime stage ----
FROM oven/bun:1-alpine
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY package.json ./

# Create data directory for SQLite persistence
RUN mkdir -p /app/data
VOLUME /app/data

# Environment defaults (override via docker-compose or -e flags)
ENV PORT=8787
ENV DATA_DIR=/app/data
ENV AUTH_TOKEN=""
ENV SYSTEM_PROMPT="你是一个有用的AI助手。"

EXPOSE 8787

CMD ["bun", "run", "src/local/server.ts"]