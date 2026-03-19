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

# ===============================
# 🚀 STAGE 2 — RUNTIME
# ===============================
FROM node:20-bullseye-slim

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Copia apenas o necessário
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Entrypoint genérico para repassar o comando final do serviço
COPY entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# Porta dinâmica Railway (process.env.PORT em runtime)
EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/main.js"]
