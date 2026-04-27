import type { JobsOptions } from 'bullmq';

export type ExtendedJobsOptions = JobsOptions & { timeout?: number };

export const defaultJobOptions: ExtendedJobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
  timeout: 120000,
};

export function withDefaultJobOptions(
  overrides?: ExtendedJobsOptions,
): ExtendedJobsOptions {
  if (!overrides) return defaultJobOptions;
  return {
    ...defaultJobOptions,
    ...overrides,
    backoff: overrides.backoff ?? defaultJobOptions.backoff,
  };
}

export function normalizeJobIdPart(value: string | number | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:@-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'unknown';
}

export function buildDeterministicJobId(
  prefix: string,
  ...parts: Array<string | number | undefined>
): string {
  return [normalizeJobIdPart(prefix), ...parts.map(normalizeJobIdPart)].join(
    ':',
  );
}

export function getUtcDateJobKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcHourJobKey(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}
