import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CleanupTask } from './cleanup.task';
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
        ]),
    CompaniesModule,
  ],
  providers: [
    CleanupTask,
    ...(isRedisDisabled
      ? [
          createRedisDisabledQueueProvider('sla-escalation', {
            addMode: 'noop',
          }),
          createRedisDisabledQueueProvider('expiry-notifications', {
            addMode: 'noop',
          }),
        ]
      : []),
  ],
})
export class TasksModule {}
