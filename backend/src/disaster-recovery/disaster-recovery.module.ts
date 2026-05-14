import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AprRiskEvidence } from '../aprs/entities/apr-risk-evidence.entity';
import { Cat } from '../cats/entities/cat.entity';
import { CommonModule } from '../common/common.module';
import { SecurityAuditModule } from '../common/security/security-audit.module';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';
import { DocumentVideoAttachment } from '../document-videos/entities/document-video-attachment.entity';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { createRedisDisabledQueueProvider } from '../queue/redis-disabled-queue';
import { shouldUseRedisQueueInfra } from '../queue/redis-queue-infra.util';
import { TenantBackupAdminController } from './tenant-backup.admin.controller';
import { TenantBackupService } from './tenant-backup.service';
import { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import { DisasterRecoveryIntegrityService } from './disaster-recovery-integrity.service';
import { DisasterRecoveryReplicaStorageService } from './disaster-recovery-replica-storage.service';
import { DisasterRecoveryStorageProtectionService } from './disaster-recovery-storage-protection.service';
import { DisasterRecoveryExecution } from './entities/disaster-recovery-execution.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DisasterRecoveryExecution,
      DocumentRegistryEntry,
      DocumentVideoAttachment,
      Cat,
      NonConformity,
      AprRiskEvidence,
    ]),
    ...(shouldUseRedisQueueInfra()
      ? [BullModule.registerQueue({ name: 'tenant-backup' })]
      : []),
    CommonModule,
    SecurityAuditModule,
    ForensicTrailModule,
  ],
  controllers: [TenantBackupAdminController],
  providers: [
    DisasterRecoveryExecutionService,
    DisasterRecoveryIntegrityService,
    DisasterRecoveryReplicaStorageService,
    DisasterRecoveryStorageProtectionService,
    TenantBackupService,
    ...(!shouldUseRedisQueueInfra()
      ? [createRedisDisabledQueueProvider('tenant-backup')]
      : []),
  ],
  exports: [
    DisasterRecoveryExecutionService,
    DisasterRecoveryIntegrityService,
    DisasterRecoveryReplicaStorageService,
    DisasterRecoveryStorageProtectionService,
    TenantBackupService,
  ],
})
export class DisasterRecoveryModule {}
