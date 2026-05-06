import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Apr } from '../aprs/entities/apr.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { CompaniesModule } from '../companies/companies.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Training } from '../trainings/entities/training.entity';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Apr, Checklist, Dds, Epi, Pt, Training]),
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'pdf-generation' })]),
    CompaniesModule,
    DocumentRegistryModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ...(isRedisDisabled
      ? [createRedisDisabledQueueProvider('pdf-generation')]
      : []),
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
