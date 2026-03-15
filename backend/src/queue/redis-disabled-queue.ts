import { ServiceUnavailableException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';

type DisabledQueueMode = 'throw' | 'noop';

type DisabledQueueOptions = {
  addMode?: DisabledQueueMode;
};

export const isRedisDisabled = /^true$/i.test(process.env.REDIS_DISABLED || '');

export function createRedisDisabledQueueStub(
  queueName: string,
  options: DisabledQueueOptions = {},
) {
  const addMode = options.addMode ?? 'throw';
  const message =
    `Fila "${queueName}" indisponível: REDIS_DISABLED=true. ` +
    'O runtime segue ativo em modo degradado, sem processamento assíncrono.';

  return {
    add: () => {
      if (addMode === 'noop') {
        return Promise.resolve(null);
      }

      return Promise.reject(new ServiceUnavailableException(message));
    },
    getJob: () => Promise.resolve(null),
    getJobs: () => Promise.resolve([]),
    getJobCounts: () =>
      Promise.resolve({
        active: 0,
        wait: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      }),
  };
}

export function createRedisDisabledQueueProvider(
  queueName: string,
  options?: DisabledQueueOptions,
) {
  return {
    provide: getQueueToken(queueName),
    useValue: createRedisDisabledQueueStub(queueName, options),
  };
}
