import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DisasterRecoveryModule } from './disaster-recovery.module';
import { TenantBackupProcessor } from './tenant-backup.processor';
import { TenantBackupSchedulerService } from './tenant-backup.scheduler.service';

/**
 * Worker-only module for Disaster Recovery jobs (backup/prune).
 *
 * IMPORTANTE:
 * - Não importar no AppModule (web).
 * - Importar apenas no WorkerModule.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'tenant-backup' }),
    DisasterRecoveryModule,
  ],
  providers: [TenantBackupProcessor, TenantBackupSchedulerService],
})
export class DisasterRecoveryWorkerModule {}
