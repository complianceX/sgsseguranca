import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailLog } from './entities/mail-log.entity';
import { Cat } from '../cats/entities/cat.entity';
import { EpisModule } from '../epis/epis.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { PtsModule } from '../pts/pts.module';
import { AprsModule } from '../aprs/aprs.module';
import { ArrsModule } from '../arrs/arrs.module';
import { Checklist } from '../checklists/entities/checklist.entity';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { DdsModule } from '../dds/dds.module';
import { DidsModule } from '../dids/dids.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { AuditsModule } from '../audits/audits.module';
import { RdosModule } from '../rdos/rdos.module';
import { CompaniesModule } from '../companies/companies.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsModule } from '../reports/reports.module';
import { FileInspectionModule } from '../common/security/file-inspection.module';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';
import { MailDlqService } from './mail-dlq.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailLog, Cat, Checklist]),
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'mail' }, { name: 'mail-dlq' })]),
    EpisModule,
    forwardRef(() => TrainingsModule),
    forwardRef(() => PtsModule),
    forwardRef(() => AprsModule),
    forwardRef(() => ArrsModule),
    forwardRef(() => NonConformitiesModule),
    forwardRef(() => DdsModule),
    forwardRef(() => DidsModule),
    forwardRef(() => InspectionsModule),
    forwardRef(() => AuditsModule),
    forwardRef(() => RdosModule),
    CompaniesModule,
    StorageModule,
    ReportsModule,
    FileInspectionModule,
  ],
  providers: [
    MailService,
    MailDlqService,
    ...(isRedisDisabled
      ? [
          createRedisDisabledQueueProvider('mail'),
          createRedisDisabledQueueProvider('mail-dlq'),
        ]
      : []),
  ],
  controllers: [MailController],
  exports: [MailService, MailDlqService],
})
export class MailModule {}
