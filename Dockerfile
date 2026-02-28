FROM node:20-bullseye AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY backend/package*.json ./
RUN npm ci
COPY backend .
RUN npm run build

FROM node:20-bullseye-slim
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
