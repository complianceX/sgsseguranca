'use strict';
// Verifica se o worker está vivo consultando o heartbeat no Redis.
// Usado pelo HEALTHCHECK do Docker — exit 0 = saudável, exit 1 = falha.
const Redis = require('ioredis');

const url =
  process.env.REDIS_QUEUE_URL ||
  process.env.REDIS_AUTH_URL ||
  process.env.REDIS_CACHE_URL ||
  '';
const key =
  process.env.WORKER_HEARTBEAT_KEY || 'worker:heartbeat:queue-runtime';

if (!url) {
  process.exit(1);
}

const redis = new Redis(url, {
  lazyConnect: true,
  connectTimeout: 5000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
});

const deadline = setTimeout(() => {
  redis.disconnect(false);
  process.exit(1);
}, 8000);

redis
  .connect()
  .then(() => redis.get(key))
  .then((value) => {
    clearTimeout(deadline);
    redis.disconnect(false);
    process.exit(value ? 0 : 1);
  })
  .catch(() => {
    clearTimeout(deadline);
    process.exit(1);
  });
