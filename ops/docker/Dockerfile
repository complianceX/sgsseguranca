FROM node:20-bullseye AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=development
COPY backend/package*.json ./
RUN npm ci --include=dev
COPY backend .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

FROM node:20-bullseye-slim
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
COPY --from=builder /app/newrelic.js ./newrelic.js
RUN sed -i 's/\r$//' ./entrypoint.sh \
  && chmod +x ./entrypoint.sh \
  && chown -R node:node /app
USER node
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/main.js"]
