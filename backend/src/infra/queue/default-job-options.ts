import type { JobsOptions } from 'bullmq';

// BullMQ v5 removeu o campo `timeout` como JobsOption. Qualquer valor passado aqui
// e silenciosamente ignorado. Use withJobTimeout() nos processors para timeouts reais.
export type ExtendedJobsOptions = JobsOptions & { timeout?: number };

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 100,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 500,
  },
};

export function withDefaultJobOptions(
  overrides?: ExtendedJobsOptions,
): JobsOptions {
  if (!overrides) return defaultJobOptions;
  // Desestrutura timeout (ignorado pelo BullMQ v5) antes de repassar ao broker.
  const { timeout: _ignored, ...safeOverrides } = overrides;
  return {
    ...defaultJobOptions,
    ...safeOverrides,
    backoff: safeOverrides.backoff ?? defaultJobOptions.backoff,
  };
}

export function normalizeJobIdPart(value: string | number | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'unknown';
}

export function buildDeterministicJobId(
  prefix: string,
  ...parts: Array<string | number | undefined>
): string {
  return [normalizeJobIdPart(prefix), ...parts.map(normalizeJobIdPart)].join(
    '-',
  );
}

export function getUtcDateJobKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcHourJobKey(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}
