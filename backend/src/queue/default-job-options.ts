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
