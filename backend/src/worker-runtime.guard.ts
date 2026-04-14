import { resolveRedisConnection } from './common/redis/redis-connection.util';

export function assertWorkerRedisContract(env: NodeJS.ProcessEnv): void {
  if (/^true$/i.test(env.REDIS_DISABLED || '')) {
    throw new Error(
      'REDIS_DISABLED=true não é suportado no runtime worker. ' +
        'Inicie apenas a API em modo degradado ou habilite Redis para processar filas.',
    );
  }

  if (!resolveRedisConnection(env, 'queue')) {
    throw new Error(
      'Worker sem Redis de fila configurado. Defina REDIS_QUEUE_URL ou o fallback genérico.',
    );
  }
}
