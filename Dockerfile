FROM node:20-bullseye AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend .
RUN npm run build

FROM node:20-bullseye-slim
RUN apt-get update && apt-get install -y chromium fonts-liberation libatk-bridge2.0-0 libgtk-3-0 libnss3 libxss1 libasound2 --no-install-recommends && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
