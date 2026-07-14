import { ConfigService } from '@nestjs/config';
import { IntegrationResilienceService } from './integration-resilience.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryService } from './retry.service';

describe('IntegrationResilienceService', () => {
  function makeService(env: Record<string, string> = {}) {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    // captura o breakerConfig passado ao circuit breaker
    const capturedBreakerConfigs: Array<Record<string, unknown>> = [];
    const circuitBreaker = {
      execute: jest.fn(
        async (
          _name: string,
          fn: () => Promise<unknown>,
          config: Record<string, unknown>,
        ) => {
          capturedBreakerConfigs.push(config);
          return fn();
        },
      ),
    } as unknown as CircuitBreakerService;

    const capturedRetryOptions: Array<Record<string, unknown>> = [];
    const retryService = {
      execute: jest.fn(
        async (fn: () => Promise<unknown>, opts: Record<string, unknown>) => {
          capturedRetryOptions.push(opts);
          return fn();
        },
      ),
    } as unknown as RetryService;

    const service = new IntegrationResilienceService(
      configService,
      circuitBreaker,
      retryService,
    );

    return { service, capturedBreakerConfigs, capturedRetryOptions };
  }

  it('dá ao circuit breaker um timeout que cobre TODAS as tentativas de retry, não apenas uma', async () => {
    // Regressão: antes o breaker.timeout era igual ao timeout de UMA tentativa
    // (timeoutMs). Como o retryService roda DENTRO do breaker, qualquer chamada
    // lenta com attempts>1 estourava com "Circuit breaker timeout" antes do
    // retry terminar — foi o que derrubou a Sophie em produção.
    const { service, capturedBreakerConfigs } = makeService();

    await service.execute('llm_chat_completion', () => Promise.resolve('ok'), {
      timeoutMs: 30_000,
      retry: { attempts: 2, maxDelayMs: 2_000 },
    });

    const breakerConfig = capturedBreakerConfigs[0];
    // 30000 * 2 (tentativas) + 2000 * 1 (delay entre elas) + 500 folga = 62500
    expect(breakerConfig.timeout).toBe(62_500);
    // e sempre estritamente maior que o timeout de uma tentativa
    expect(breakerConfig.timeout as number).toBeGreaterThan(30_000);
  });

  it('com uma única tentativa, o breaker timeout ainda dá folga sobre a tentativa', async () => {
    const { service, capturedBreakerConfigs } = makeService();

    await service.execute('llm_chat_completion', () => Promise.resolve('ok'), {
      timeoutMs: 10_000,
      retry: { attempts: 1, maxDelayMs: 2_000 },
    });

    // 10000 * 1 + 2000 * 0 + 500 = 10500
    expect(capturedBreakerConfigs[0].timeout).toBe(10_500);
  });

  it('propaga o resultado da função executada', async () => {
    const { service } = makeService();
    const result = await service.execute(
      'llm_chat_completion',
      () => Promise.resolve('resultado'),
      { timeoutMs: 5_000, retry: { attempts: 1 } },
    );
    expect(result).toBe('resultado');
  });
});
