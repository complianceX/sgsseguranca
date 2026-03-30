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

# Dependências mínimas para o Puppeteer gerar PDFs no serviço web.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libasound2 \
  || (apt-get update --fix-missing && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libasound2) \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Thread pool do libuv:
# - default 4 tende a aumentar fila de hash sob login concorrente
# - valores muito altos podem causar pressão de memória em instâncias pequenas
# Começamos em 16 e ajustamos por ambiente via variável do serviço.
ENV UV_THREADPOOL_SIZE=16

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
