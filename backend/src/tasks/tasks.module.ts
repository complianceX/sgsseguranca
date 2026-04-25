import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisDisabled } from '../queue/redis-disabled-queue';

@Module({
  imports: [
    ...(isRedisDisabled
      ? []
      : [
          BullModule.registerQueue({ name: 'sla-escalation' }),
          BullModule.registerQueue({ name: 'expiry-notifications' }),
          BullModule.registerQueue({ name: 'document-retention' }),
          BullModule.registerQueue({ name: 'pdf-generation-dlq' }),
        ]),
  ],
})
export class TasksModule {}
