import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
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
    BullModule.registerQueueAsync({
      name: 'mail',
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: Number(configService.get('REDIS_PORT')),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
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
  providers: [MailService, MailProcessor],
  controllers: [MailController],
  exports: [MailService, BullModule],
})
export class MailModule {}
