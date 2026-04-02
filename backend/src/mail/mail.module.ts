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
import { Checklist } from '../checklists/entities/checklist.entity';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { DdsModule } from '../dds/dds.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { AuditsModule } from '../audits/audits.module';
import { RdosModule } from '../rdos/rdos.module';
import { CompaniesModule } from '../companies/companies.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsModule } from '../reports/reports.module';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailLog, Cat, Checklist]),
    ...(isRedisDisabled ? [] : [BullModule.registerQueue({ name: 'mail' })]),
    EpisModule,
    forwardRef(() => TrainingsModule),
    forwardRef(() => PtsModule),
    forwardRef(() => AprsModule),
    forwardRef(() => NonConformitiesModule),
    forwardRef(() => DdsModule),
    forwardRef(() => InspectionsModule),
    forwardRef(() => AuditsModule),
    forwardRef(() => RdosModule),
    CompaniesModule,
    StorageModule,
    ReportsModule,
  ],
  providers: [
    MailService,
    ...(isRedisDisabled ? [createRedisDisabledQueueProvider('mail')] : []),
  ],
  controllers: [MailController],
  exports: [MailService],
})
export class MailModule {}
