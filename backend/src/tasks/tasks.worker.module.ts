import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CleanupTask } from './cleanup.task';
import { DocumentRetentionScheduler } from './document-retention.scheduler';
import { GdprRetentionCleanupScheduler } from './gdpr-retention-cleanup.scheduler';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AdminModule } from '../admin/admin.module';
import { CompaniesModule } from '../companies/companies.module';
import { QueueServicesModule } from '../queue/queue-services.module';

/**
 * Worker-only module.
 *
 * Regra: nenhum scheduler/cron pesado deve rodar no runtime web (HTTP).
 * Este módulo concentra tasks agendadas que:
 * - limpam dados temporários/logs
 * - enfileiram jobs por tenant
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    BullModule.registerQueue(
      { name: 'sla-escalation' },
      { name: 'expiry-notifications' },
      { name: 'document-retention' },
      { name: 'pdf-generation-dlq' },
    ),
    QueueServicesModule,
    CompaniesModule,
    AdminModule,
  ],
  providers: [
    CleanupTask,
    DocumentRetentionScheduler,
    GdprRetentionCleanupScheduler,
  ],
})
export class TasksWorkerModule {}
