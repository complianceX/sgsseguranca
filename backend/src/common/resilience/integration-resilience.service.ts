import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryService } from './retry.service';

export interface IntegrationResilienceOptions {
  timeoutMs?: number;
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
    mode?: 'idempotent' | 'safe';
  };
  breaker?: {
    failureThreshold?: number;
    successThreshold?: number;
    resetTimeoutMs?: number;
  };
}

@Injectable()
export class IntegrationResilienceService {
  private readonly logger = new Logger(IntegrationResilienceService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly retryService: RetryService,
  ) {}

  /**
   * Wrapper padrão obrigatório para chamadas de integrações externas.
   * - Aplica circuit breaker + timeout
   * - Aplica retry consistente (com backoff+jitter)
   */
  async execute<T>(
    integrationName: string,
    fn: () => Promise<T>,
    opts?: IntegrationResilienceOptions,
  ): Promise<T> {
    const normalized = normalizeIntegrationName(integrationName);
    const timeoutMs =
      opts?.timeoutMs ??
      this.getIntegrationNumberEnv(normalized, 'TIMEOUT_MS') ??
      this.getNumberEnv('INTEGRATION_TIMEOUT_MS', 10_000);

    const breakerConfig = {
      failureThreshold:
        opts?.breaker?.failureThreshold ??
        this.getIntegrationNumberEnv(normalized, 'CB_FAILURE_THRESHOLD') ??
        this.getNumberEnv('INTEGRATION_CB_FAILURE_THRESHOLD', 5),
      successThreshold:
        opts?.breaker?.successThreshold ??
        this.getIntegrationNumberEnv(normalized, 'CB_SUCCESS_THRESHOLD') ??
        this.getNumberEnv('INTEGRATION_CB_SUCCESS_THRESHOLD', 2),
      resetTimeout:
        opts?.breaker?.resetTimeoutMs ??
        this.getIntegrationNumberEnv(normalized, 'CB_RESET_TIMEOUT_MS') ??
        this.getNumberEnv('INTEGRATION_CB_RESET_TIMEOUT_MS', 30_000),
      timeout: timeoutMs,
    };

    const retryMode = opts?.retry?.mode ?? 'idempotent';
    const retryAttempts =
      opts?.retry?.attempts ??
      this.getIntegrationNumberEnv(normalized, 'RETRY_ATTEMPTS') ??
      this.getNumberEnv('INTEGRATION_RETRY_ATTEMPTS', 3);
    const baseDelayMs =
      opts?.retry?.baseDelayMs ??
      this.getIntegrationNumberEnv(normalized, 'RETRY_BASE_DELAY_MS') ??
      this.getNumberEnv('INTEGRATION_RETRY_BASE_DELAY_MS', 200);
    const maxDelayMs =
      opts?.retry?.maxDelayMs ??
      this.getIntegrationNumberEnv(normalized, 'RETRY_MAX_DELAY_MS') ??
      this.getNumberEnv('INTEGRATION_RETRY_MAX_DELAY_MS', 2_000);
    const jitterRatio =
      opts?.retry?.jitterRatio ??
      this.getIntegrationNumberEnv(normalized, 'RETRY_JITTER_RATIO') ??
      this.getNumberEnv('INTEGRATION_RETRY_JITTER_RATIO', 0.2);

    const retryOptions = {
      attempts: Math.max(1, retryAttempts),
      baseDelayMs,
      maxDelayMs,
      jitterRatio,
      ...(retryMode === 'safe'
        ? { shouldRetry: (error: unknown) => isSafeToRetry(error) }
        : {}),
      onRetry: ({
        attempt,
        delayMs,
        error,
      }: {
        attempt: number;
        delayMs: number;
        error: unknown;
      }) => {
        this.logger.warn({
          event: 'integration_retry',
          integration: normalized,
          attempt,
          delayMs,
          error: summarizeError(error),
        });
      },
    };

    return this.circuitBreaker.execute(
      `integration:${normalized}`,
      async () => this.retryService.execute(fn, retryOptions),
      breakerConfig,
    );
  }

  private getNumberEnv(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }

  private getIntegrationNumberEnv(
    normalized: string,
    suffix: string,
  ): number | null {
    const envName = `${normalized.toUpperCase()}_${suffix}`;
    const raw = this.configService.get<string>(envName);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }
}

function normalizeIntegrationName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function summarizeError(error: unknown): string {
  const anyErr = error as any;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : undefined;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
  const status =
    typeof anyErr?.status === 'number'
      ? anyErr.status
      : typeof anyErr?.statusCode === 'number'
        ? anyErr.statusCode
        : typeof anyErr?.response?.status === 'number'
          ? anyErr.response.status
          : undefined;
  return [
    message,
    code ? `code=${code}` : null,
    typeof status === 'number' ? `status=${status}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Modo "safe": reduz risco de efeitos colaterais duplicados (ex.: e-mail).
 * Só retenta em erros de transporte/timeout, evitando retentar em 5xx genérico.
 */
function isSafeToRetry(error: unknown): boolean {
  const anyErr = error as any;
  const code =
    typeof anyErr?.code === 'string'
      ? anyErr.code
      : typeof anyErr?.cause?.code === 'string'
        ? anyErr.cause.code
        : undefined;
  if (code) {
    const safeCodes = new Set([
      'ETIMEDOUT',
      'ECONNRESET',
      'EAI_AGAIN',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_SOCKET',
    ]);
    if (safeCodes.has(code)) return true;
  }
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : '';
  return /timeout|timed out|socket hang up|connection reset/i.test(msg);
}
