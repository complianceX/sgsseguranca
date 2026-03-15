import { resolveRedisConnection } from './common/redis/redis-connection.util';

export function assertWorkerRedisContract(env: NodeJS.ProcessEnv): void {
  if (/^true$/i.test(env.REDIS_DISABLED || '')) {
    throw new Error(
      'REDIS_DISABLED=true não é suportado no runtime worker. ' +
        'Inicie apenas a API em modo degradado ou habilite Redis para processar filas.',
    );
  }

  if (!resolveRedisConnection(env)) {
    throw new Error(
      'Worker sem Redis configurado. Defina REDIS_URL/URL_REDIS/REDIS_PUBLIC_URL ou REDIS_HOST.',
    );
  }
}
