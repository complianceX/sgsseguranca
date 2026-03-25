import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CleanupTask } from './cleanup.task';
import { DocumentRetentionScheduler } from './document-retention.scheduler';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CompaniesModule } from '../companies/companies.module';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ...(isRedisDisabled
      ? []
      : [
          BullModule.registerQueue({ name: 'sla-escalation' }),
          BullModule.registerQueue({ name: 'expiry-notifications' }),
          BullModule.registerQueue({ name: 'document-retention' }),
        ]),
    CompaniesModule,
  ],
  providers: [
    CleanupTask,
    DocumentRetentionScheduler,
    ...(isRedisDisabled
      ? [
          createRedisDisabledQueueProvider('sla-escalation', {
            addMode: 'noop',
          }),
          createRedisDisabledQueueProvider('expiry-notifications', {
            addMode: 'noop',
          }),
          createRedisDisabledQueueProvider('document-retention', {
            addMode: 'noop',
          }),
        ]
      : []),
  ],
})
export class TasksModule {}
