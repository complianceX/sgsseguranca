import {
  BeforeApplicationShutdown,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';

type ClosableQueue = Pick<Queue, 'close'> & {
  close?: () => Promise<void>;
};

const APP_QUEUE_NAMES = [
  'mail',
  'mail-dlq',
  'pdf-generation',
  'ai-recovery',
  'document-import',
  'document-import-dlq',
  'tenant-backup',
  'sla-escalation',
  'expiry-notifications',
  'document-retention',
] as const;

@Injectable()
export class BullQueueShutdownService
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private shutdownPromise?: Promise<void>;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.shutdown();
  }

  private shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.closeQueues();
    }

    return this.shutdownPromise;
  }

  private async closeQueues(): Promise<void> {
    const queues = APP_QUEUE_NAMES.map((queueName) =>
      this.resolveQueue(queueName),
    ).filter((queue): queue is ClosableQueue => queue !== null);

    await Promise.all(
      [...new Set(queues)].map(async (queue) => {
        if (typeof queue.close !== 'function') {
          return;
        }

        try {
          await Promise.race([
            queue.close(),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        } catch {
          // noop
        }
      }),
    );
  }

  private resolveQueue(queueName: (typeof APP_QUEUE_NAMES)[number]) {
    try {
      return this.moduleRef.get<ClosableQueue>(getQueueToken(queueName), {
        strict: false,
      });
    } catch {
      return null;
    }
  }
}
