import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CleanupTask } from './cleanup.task';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    BullModule.registerQueue({ name: 'sla-escalation' }),
    BullModule.registerQueue({ name: 'expiry-notifications' }),
    CompaniesModule,
  ],
  providers: [CleanupTask],
})
export class TasksModule {}
