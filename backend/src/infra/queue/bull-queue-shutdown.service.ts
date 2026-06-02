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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const APP_QUEUE_NAMES = [
  'mail',
  'mail-dlq',
  'pdf-generation',
  'ai-recovery',
  'document-import',
  'document-import-dlq',
  'tenant-backup',
  'dashboard-revalidate',
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
          await withTimeout(queue.close(), 1500);
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
