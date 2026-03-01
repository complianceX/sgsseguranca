import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailLog } from './entities/mail-log.entity';
import { EpisModule } from '../epis/epis.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { PtsModule } from '../pts/pts.module';
import { AprsModule } from '../aprs/aprs.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { DdsModule } from '../dds/dds.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { AuditsModule } from '../audits/audits.module';
import { CompaniesModule } from '../companies/companies.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailLog]),
    BullModule.registerQueue({ name: 'mail' }),
    EpisModule,
    TrainingsModule,
    PtsModule,
    AprsModule,
    forwardRef(() => ChecklistsModule),
    NonConformitiesModule,
    DdsModule,
    InspectionsModule,
    AuditsModule,
    CompaniesModule,
    StorageModule,
    ReportsModule,
  ],
  providers: [MailService],
  controllers: [MailController],
  exports: [MailService],
})
export class MailModule {}
