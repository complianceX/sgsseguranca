import { assertWorkerRedisContract } from './worker-runtime.guard';

describe('assertWorkerRedisContract', () => {
  it('permite subir o worker quando há Redis configurado', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'false',
        REDIS_URL: 'rediss://default:secret@example.upstash.io:6380',
      }),
    ).not.toThrow();
  });

  it('bloqueia explicitamente o worker quando REDIS_DISABLED=true', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'true',
      }),
    ).toThrow(
      'REDIS_DISABLED=true não é suportado no runtime worker. Inicie apenas a API em modo degradado ou habilite Redis para processar filas.',
    );
  });

  it('bloqueia o worker quando Redis não está configurado', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'false',
      }),
    ).toThrow(
      'Worker sem Redis de fila configurado. Defina REDIS_QUEUE_URL ou o fallback genérico.',
    );
  });
});
