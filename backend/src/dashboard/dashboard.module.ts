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
import { InspectionsModule } from '../inspections/inspections.module';
import { Inspection } from '../inspections/entities/inspection.entity';
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
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import {
  DASHBOARD_DOMAIN_METRICS,
  DashboardService,
} from './dashboard.service';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';
import { MetricsRegistryService } from '../common/observability/metrics-registry.service';

@Module({
  imports: [
    AprsModule,
    AuditsModule,
    CatsModule,
    ChecklistsModule,
    DdsModule,
    DocumentImportModule,
    InspectionsModule,
    NonConformitiesModule,
    NotificationsModule,
    PtsModule,
    RdosModule,
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'dashboard-revalidate' })]),
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
      MonthlySnapshot,
      Notification,
      MedicalExam,
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardPendingQueueService,
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
    ...(isRedisDisabled
      ? [
          createRedisDisabledQueueProvider('dashboard-revalidate', {
            addMode: 'noop',
          }),
        ]
      : []),
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
