import { Injectable, Logger } from '@nestjs/common';

interface CircuitBreakerConfig {
  failureThreshold: number; // Número de falhas antes de abrir
  successThreshold: number; // Número de sucessos para fechar
  timeout: number; // Timeout em ms
  resetTimeout: number; // Tempo para tentar half-open em ms
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface BreakerData {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  config: CircuitBreakerConfig;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private breakers = new Map<string, BreakerData>();

  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 5000,
    resetTimeout: 30000,
  };

  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const breaker = this.getOrCreateBreaker(name, finalConfig);

    // Check state
    if (breaker.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
      if (timeSinceLastFailure < finalConfig.resetTimeout) {
        throw new Error(
          `Circuit breaker ${name} is OPEN. Retry after ${finalConfig.resetTimeout}ms`,
        );
      }
      // Try half-open
      breaker.state = CircuitState.HALF_OPEN;
      breaker.successCount = 0;
      this.logger.warn(`Circuit breaker ${name} is now HALF_OPEN`);
    }

    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('Circuit breaker timeout')),
            finalConfig.timeout,
          );
        }),
      ]);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      this.onSuccess(name, breaker, finalConfig);
      return result;
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      this.onFailure(name, breaker, finalConfig);
      throw error;
    }
  }

  private onSuccess(
    name: string,
    breaker: BreakerData,
    config: CircuitBreakerConfig,
  ) {
    breaker.failureCount = 0;

    if (breaker.state === CircuitState.HALF_OPEN) {
      breaker.successCount++;
      if (breaker.successCount >= config.successThreshold) {
        breaker.state = CircuitState.CLOSED;
        breaker.successCount = 0;
        this.logger.log(`Circuit breaker ${name} is now CLOSED`);
      }
    }
  }

  private onFailure(
    name: string,
    breaker: BreakerData,
    config: CircuitBreakerConfig,
  ) {
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === CircuitState.HALF_OPEN) {
      breaker.state = CircuitState.OPEN;
      this.logger.error(
        `Circuit breaker ${name} is now OPEN (half-open failed)`,
      );
    } else if (
      breaker.state === CircuitState.CLOSED &&
      breaker.failureCount >= config.failureThreshold
    ) {
      breaker.state = CircuitState.OPEN;
      this.logger.error(
        `Circuit breaker ${name} is now OPEN (threshold exceeded)`,
      );
    }
  }

  private getOrCreateBreaker(
    name: string,
    config: CircuitBreakerConfig,
  ): BreakerData {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        config,
      });
    }
    return this.breakers.get(name)!;
  }

  getState(name: string): CircuitState | null {
    return this.breakers.get(name)?.state ?? null;
  }

  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.state = CircuitState.CLOSED;
      breaker.failureCount = 0;
      breaker.successCount = 0;
      this.logger.log(`Circuit breaker ${name} has been reset`);
    }
  }
}
