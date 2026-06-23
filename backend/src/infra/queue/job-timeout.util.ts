import { captureException } from '../../shared/monitoring/sentry';

export class JobTimeoutError extends Error {
  readonly jobName: string;
  readonly jobId: string | undefined;
  readonly timeoutMs: number;

  constructor(jobName: string, jobId: string | undefined, timeoutMs: number) {
    super(
      `Job "${jobName}" (id=${jobId ?? 'sem-id'}) timeout apos ${timeoutMs}ms`,
    );
    this.name = 'JobTimeoutError';
    this.jobName = jobName;
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
  }
}

interface JobTimeoutLogger {
  error: (message: unknown, ...args: unknown[]) => void;
}

/**
 * Executa fn() com um deadline absoluto.
 *
 * Uso nos processors de BullMQ para substituir o campo `timeout` que foi
 * removido no BullMQ v5 e era silenciosamente ignorado.
 *
 * Ao estourar o prazo: loga erro estruturado, dispara Sentry e rejeita com
 * JobTimeoutError. O job falha normalmente e passa pelo mecanismo de retry
 * do Bull (backoff exponencial configurado em defaultJobOptions).
 */
export function withJobTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context: {
    jobName: string;
    jobId: string | undefined;
    logger: JobTimeoutLogger;
  },
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      const error = new JobTimeoutError(
        context.jobName,
        context.jobId,
        timeoutMs,
      );
      context.logger.error(
        `[Job ${context.jobId ?? 'sem-id'}] Timeout de ${timeoutMs}ms excedido para "${context.jobName}" — job abortado`,
      );
      captureException(error, {
        tags: { 'job.timeout': 'true', jobName: context.jobName },
        extra: { jobId: context.jobId, timeoutMs },
      });
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]).finally(() => {
    clearTimeout(handle);
  });
}
