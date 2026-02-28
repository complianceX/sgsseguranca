# ===============================
# 🏗 STAGE 1 — BUILD
# ===============================
FROM node:20-bullseye AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===============================
# 🚀 STAGE 2 — RUNTIME
# ===============================
FROM node:20-bullseye-slim

# Dependências necessárias para Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libnss3 \
  libxss1 \
  libasound2 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copia apenas o necessário
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Porta dinâmica Railway
EXPOSE 3000

# Executa migrations antes de subir
CMD ["sh", "-c", "npm run migration:run && node dist/main.js"]
