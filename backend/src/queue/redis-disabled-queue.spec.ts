import { ServiceUnavailableException } from '@nestjs/common';
import { createRedisDisabledQueueStub } from './redis-disabled-queue';

describe('redis-disabled-queue', () => {
  it('falha com 503 por padrao ao tentar enfileirar', async () => {
    const queue = createRedisDisabledQueueStub('pdf-generation');

    await expect(queue.add()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('permite modo noop para tarefas internas agendadas', async () => {
    const queue = createRedisDisabledQueueStub('sla-escalation', {
      addMode: 'noop',
    });

    await expect(queue.add()).resolves.toBeNull();
    await expect(queue.getJobs()).resolves.toEqual([]);
    await expect(queue.getJob()).resolves.toBeNull();
  });
});
