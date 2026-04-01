import { Logger } from '@nestjs/common';
import { RequestContext } from '../middleware/request-context.middleware';

type StageProfileOptions<T> = {
  logger: Logger;
  route: string;
  stage: string;
  run: () => Promise<T> | T;
  companyId?: string;
  userId?: string;
};

function isPerfProfilingEnabled(): boolean {
  return String(process.env.PERF_PROFILING_ENABLED || '').toLowerCase() === 'true';
}

function getPerfSampleRate(): number {
  const raw = Number(process.env.PERF_PROFILING_SAMPLE_RATE || '1');
  if (!Number.isFinite(raw)) {
    return 1;
  }
  if (raw < 0) {
    return 0;
  }
  if (raw > 1) {
    return 1;
  }
  return raw;
}

function shouldSample(): boolean {
  return Math.random() <= getPerfSampleRate();
}

export async function profileStage<T>(
  options: StageProfileOptions<T>,
): Promise<T> {
  if (!isPerfProfilingEnabled() || !shouldSample()) {
    return Promise.resolve(options.run());
  }

  const start = process.hrtime.bigint();
  const requestId = RequestContext.getRequestId();
  const traceId = RequestContext.getTraceId();
  let outcome: 'success' | 'error' = 'success';

  try {
    return await Promise.resolve(options.run());
  } catch (error) {
    outcome = 'error';
    throw error;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    options.logger.log({
      event: 'perf_stage',
      route: options.route,
      stage: options.stage,
      outcome,
      duration_ms: Math.round(durationMs * 100) / 100,
      requestId,
      traceId,
      companyId: options.companyId || undefined,
      userId: options.userId || undefined,
    });
  }
}
