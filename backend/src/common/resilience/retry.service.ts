import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number; // 0..1
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: {
    error: unknown;
    attempt: number;
    delayMs: number;
  }) => void;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  async execute<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
    const attempts = Math.max(1, Math.floor(opts.attempts || 1));
    const baseDelayMs = Math.max(0, Math.floor(opts.baseDelayMs || 0));
    const maxDelayMs = Math.max(baseDelayMs, Math.floor(opts.maxDelayMs || 0));
    const jitterRatio = Math.min(1, Math.max(0, opts.jitterRatio ?? 0.2));
    const shouldRetry =
      opts.shouldRetry ?? ((err) => this.isTransientError(err));

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const canRetry = attempt < attempts && shouldRetry(err, attempt);
        if (!canRetry) {
          throw err;
        }

        const delayMs = this.computeDelayMs({
          attempt,
          baseDelayMs,
          maxDelayMs,
          jitterRatio,
        });
        try {
          opts.onRetry?.({ error: err, attempt, delayMs });
        } catch {
          // ignore
        }
        this.logger.warn({
          event: 'integration_retry_scheduled',
          attempt,
          delayMs,
          error: this.errorSummary(err),
        });
        await sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Retry failed');
  }

  private computeDelayMs(args: {
    attempt: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
  }): number {
    const exp = Math.min(20, args.attempt - 1);
    const raw = args.baseDelayMs * Math.pow(2, exp);
    const capped = Math.min(args.maxDelayMs, Math.max(args.baseDelayMs, raw));
    if (capped <= 0) return 0;
    const jitter = capped * args.jitterRatio * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(capped + jitter));
  }

  private isTransientError(error: unknown): boolean {
    const anyErr = error as any;

    const status =
      typeof anyErr?.status === 'number'
        ? anyErr.status
        : typeof anyErr?.statusCode === 'number'
          ? anyErr.statusCode
          : typeof anyErr?.response?.status === 'number'
            ? anyErr.response.status
            : undefined;
    if (typeof status === 'number') {
      if (status === 408 || status === 425 || status === 429) return true;
      if (status >= 500 && status <= 599) return true;
    }

    const code =
      typeof anyErr?.code === 'string'
        ? anyErr.code
        : typeof anyErr?.cause?.code === 'string'
          ? anyErr.cause.code
          : undefined;
    if (code) {
      const transientCodes = new Set([
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
      if (transientCodes.has(code)) return true;
    }

    const msg = typeof anyErr?.message === 'string' ? anyErr.message : '';
    if (/timeout|timed out|socket hang up|connection reset/i.test(msg)) {
      return true;
    }

    return false;
  }

  private errorSummary(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}

function sleep(ms: number): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
