import { assertWorkerRedisContract } from './worker-runtime.guard';

describe('assertWorkerRedisContract', () => {
  it('permite subir o worker quando REDIS_DISABLED não está ativo', () => {
    expect(() =>
      assertWorkerRedisContract({
        REDIS_DISABLED: 'false',
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
});
