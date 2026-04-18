import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DdsController } from './dds.controller';
import { Dds } from './entities/dds.entity';
import { DdsApprovalRecord } from './entities/dds-approval-record.entity';
import { ForensicTrailEvent } from '../forensic-trail/entities/forensic-trail-event.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { MetricsRegistryService } from '../common/observability/metrics-registry.service';
import { DDS_DOMAIN_METRICS, DdsService } from './dds.service';
import { User } from '../users/entities/user.entity';
import { DdsApprovalService } from './dds-approval.service';
import { DdsObservabilityService } from './dds-observability.service';
import { DdsObservabilityAlertsService } from './dds-observability-alerts.service';
import { PublicDdsValidationController } from './public-dds-validation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dds,
      DdsApprovalRecord,
      Company,
      User,
      ForensicTrailEvent,
    ]),
    CommonModule,
    forwardRef(() => AuthModule),
    DocumentRegistryModule,
    DocumentVideosModule,
    forwardRef(() => MailModule),
    NotificationsModule,
    SignaturesModule,
  ],
  controllers: [DdsController, PublicDdsValidationController],
  providers: [
    DdsService,
    DdsApprovalService,
    DdsObservabilityService,
    DdsObservabilityAlertsService,
    {
      provide: DDS_DOMAIN_METRICS,
      inject: [MetricsRegistryService],
      useFactory: (registry: MetricsRegistryService) =>
        registry.register('dds', [
          {
            name: 'dds_created',
            description: 'Total de DDS criados por empresa',
            type: 'counter',
          },
        ]),
    },
  ],
  exports: [DdsService, DdsApprovalService],
})
export class DdsModule {}
