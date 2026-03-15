import { assertWorkerRedisContract } from './worker-runtime.guard';

describe('assertWorkerRedisContract', () => {
  it('permite subir o worker quando há Redis configurado', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'false',
        REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('bloqueia explicitamente o worker quando REDIS_DISABLED=true', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'true',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'REDIS_DISABLED=true não é suportado no runtime worker. Inicie apenas a API em modo degradado ou habilite Redis para processar filas.',
    );
  });

  it('bloqueia o worker quando Redis não está configurado', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'false',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'Worker sem Redis configurado. Defina REDIS_URL/URL_REDIS/REDIS_PUBLIC_URL ou REDIS_HOST.',
    );
  });
});
