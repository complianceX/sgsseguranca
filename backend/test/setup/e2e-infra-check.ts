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
      resolve(false);
    });
  });
}

export default async function globalSetup() {
  const dbHost = process.env.DATABASE_HOST || '127.0.0.1';
  const dbPort = Number(process.env.DATABASE_PORT || 5433);
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  const [db, redis] = await Promise.all([
    canConnect(dbHost, dbPort),
    canConnect(redisHost, redisPort),
  ]);

  const available = db && redis;
  process.env.E2E_INFRA_AVAILABLE = available ? 'true' : 'false';

  if (!available) {
    console.warn(
      `\n⚠️  E2E: infraestrutura indisponível (DB=${db ? '✓' : '✗'} Redis=${redis ? '✓' : '✗'}). ` +
        `Testes E2E serão ignorados.\n` +
        `   Inicie os serviços com: docker compose -f docker-compose.local.yml up -d\n`,
    );
  }
}
