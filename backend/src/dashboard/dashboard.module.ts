import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AprsModule } from '../aprs/aprs.module';
import { Apr } from '../aprs/entities/apr.entity';
import { AuditsModule } from '../audits/audits.module';
import { Audit } from '../audits/entities/audit.entity';
import { CatsModule } from '../cats/cats.module';
import { Checklist } from '../checklists/entities/checklist.entity';
import { ChecklistsModule } from '../checklists/checklists.module';
import { Cat } from '../cats/entities/cat.entity';
import { Company } from '../companies/entities/company.entity';
import { DdsModule } from '../dds/dds.module';
import { Dds } from '../dds/entities/dds.entity';
import { DocumentImportModule } from '../document-import/document-import.module';
import { DocumentImport } from '../document-import/entities/document-import.entity';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';
import { DocumentVideoAttachment } from '../document-videos/entities/document-video-attachment.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Inspection } from '../common/entities/inspection.entity';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PtsModule } from '../pts/pts.module';
import { Pt } from '../pts/entities/pt.entity';
import { RdosModule } from '../rdos/rdos.module';
import { Rdo } from '../rdos/entities/rdo.entity';
import { Report } from '../reports/entities/report.entity';
import { Signature } from '../signatures/entities/signature.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';
import { DashboardDocumentAvailabilitySnapshotService } from './dashboard-document-availability-snapshot.service';
import { DashboardDocumentAvailabilityWarmupService } from './dashboard-document-availability-warmup.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { DashboardQuerySnapshotService } from './dashboard-query-snapshot.service';
import { DashboardDocumentAvailabilitySnapshot } from './entities/dashboard-document-availability-snapshot.entity';
import {
  DASHBOARD_DOMAIN_METRICS,
  DashboardService,
} from './dashboard.service';
import { DashboardQuerySnapshot } from './entities/dashboard-query-snapshot.entity';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';
import { createRedisDisabledQueueProvider } from '../queue/redis-disabled-queue';
import { shouldUseRedisQueueInfra } from '../queue/redis-queue-infra.util';
import { MetricsRegistryService } from '../common/observability/metrics-registry.service';

@Module({
  imports: [
    AprsModule,
    AuditsModule,
    CatsModule,
    ChecklistsModule,
    DdsModule,
    DocumentImportModule,
    NonConformitiesModule,
    NotificationsModule,
    PtsModule,
    RdosModule,
    ...(shouldUseRedisQueueInfra()
      ? [BullModule.registerQueue({ name: 'dashboard-revalidate' })]
      : []),
    TypeOrmModule.forFeature([
      Apr,
      Audit,
      Checklist,
      Inspection,
      Training,
      NonConformity,
      Cat,
      Company,
      Dds,
      DocumentImport,
      DocumentRegistryEntry,
      DocumentVideoAttachment,
      Epi,
      Pt,
      Rdo,
      Report,
      Signature,
      Site,
      User,
      UserSession,
      DashboardQuerySnapshot,
      DashboardDocumentAvailabilitySnapshot,
      MonthlySnapshot,
      Notification,
      MedicalExam,
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardPendingQueueService,
    DashboardQuerySnapshotService,
    DashboardDocumentAvailabilitySnapshotService,
    DashboardDocumentAvailabilityWarmupService,
    DashboardDocumentPendencyOperationsService,
    DashboardDocumentPendenciesService,
    DashboardOperationalNotifierService,
    {
      provide: DASHBOARD_DOMAIN_METRICS,
      inject: [MetricsRegistryService],
      useFactory: (registry: MetricsRegistryService) =>
        registry.register('dashboard', [
          {
            name: 'cache_requests_total',
            description:
              'Total de leituras de cache do dashboard por empresa/consulta/resultado',
            type: 'counter',
          },
          {
            name: 'cache_revalidations_total',
            description:
              'Total de eventos de revalidação de cache do dashboard',
            type: 'counter',
          },
        ]),
    },
    ...(!shouldUseRedisQueueInfra()
      ? [
          createRedisDisabledQueueProvider('dashboard-revalidate', {
            addMode: 'noop',
          }),
        ]
      : []),
  ],
  exports: [DashboardService, DashboardDocumentAvailabilityWarmupService],
})
export class DashboardModule {}
