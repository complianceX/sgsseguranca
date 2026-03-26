# ===============================
# 🏗 STAGE 1 — BUILD
# ===============================
FROM node:20-bullseye AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

# ===============================
# 🚀 STAGE 2 — RUNTIME
# ===============================
FROM node:20-bullseye-slim

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Aumenta o thread pool do libuv para suportar bcrypt/argon2 concorrente sem fila.
# Com UV_THREADPOOL_SIZE=4 (default) e 50 logins simultâneos: ~12 batches × 100ms = 1.2s de espera.
# Com UV_THREADPOOL_SIZE=64: espera ≈ 0ms para workloads de até 64 operações simultâneas.
ENV UV_THREADPOOL_SIZE=64

WORKDIR /app

# Copia apenas o necessário
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/newrelic.js ./newrelic.js

# Entrypoint genérico para repassar o comando final do serviço
COPY entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# Porta dinâmica Railway (process.env.PORT em runtime)
EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/main.js"]
