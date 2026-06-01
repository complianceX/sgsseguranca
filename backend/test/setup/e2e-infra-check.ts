import * as net from 'net';
import { bootstrapBackendTestEnvironment } from './test-env';

bootstrapBackendTestEnvironment();

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInfraAvailability(
  dbHost: string,
  dbPort: number,
  redisHost: string,
  redisPort: number,
): Promise<{ db: boolean; redis: boolean; elapsedMs: number }> {
  const maxWaitMs = Number(process.env.E2E_INFRA_WAIT_MS || 20000);
  const retryIntervalMs = Number(process.env.E2E_INFRA_RETRY_MS || 1000);
  const startedAt = Date.now();

  let db = false;
  let redis = false;

  do {
    [db, redis] = await Promise.all([
      canConnect(dbHost, dbPort),
      canConnect(redisHost, redisPort),
    ]);

    if (db && redis) {
      break;
    }

    await wait(retryIntervalMs);
  } while (Date.now() - startedAt < maxWaitMs);

  return {
    db,
    redis,
    elapsedMs: Date.now() - startedAt,
  };
}

export default async function globalSetup() {
  const dbHost = process.env.DATABASE_HOST || '127.0.0.1';
  const dbPort = Number(process.env.DATABASE_PORT || 5433);
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  const { db, redis, elapsedMs } = await waitForInfraAvailability(
    dbHost,
    dbPort,
    redisHost,
    redisPort,
  );

  const available = db && redis;
  process.env.E2E_INFRA_AVAILABLE = available ? 'true' : 'false';

  if (!available) {
    console.warn(
      `\n⚠️  E2E: infraestrutura indisponível (DB=${db ? '✓' : '✗'} Redis=${redis ? '✓' : '✗'}). ` +
        `Testes E2E serão ignorados.\n` +
        `   Inicie os serviços com: docker compose -f docker-compose.test.yml up -d\n`,
    );
    return;
  }

  if (elapsedMs > 1000) {
    console.log(
      `ℹ️  E2E: infraestrutura disponível após ${Math.ceil(elapsedMs / 1000)}s.`,
    );
  }
}
