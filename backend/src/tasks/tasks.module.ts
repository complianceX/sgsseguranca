import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { shouldUseRedisQueueInfra } from '../queue/redis-queue-infra.util';

@Module({
  imports: [
    ...(shouldUseRedisQueueInfra()
      ? [
          BullModule.registerQueue({ name: 'sla-escalation' }),
          BullModule.registerQueue({ name: 'expiry-notifications' }),
          BullModule.registerQueue({ name: 'document-retention' }),
          BullModule.registerQueue({ name: 'pdf-generation-dlq' }),
        ]
      : []),
  ],
})
export class TasksModule {}
