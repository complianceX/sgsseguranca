import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { User } from '../users/entities/user.entity';
import { Apr } from '../aprs/entities/apr.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Company } from '../companies/entities/company.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Training } from '../trainings/entities/training.entity';
import { createRedisDisabledQueueProvider } from '../../infra/queue/redis-disabled-queue';
import { shouldUseRedisQueueInfra } from '../../infra/queue/redis-queue-infra.util';
import { CommonModule } from '../../shared/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      User,
      Apr,
      Checklist,
      Dds,
      Epi,
      Pt,
      Training,
      Company,
    ]),
    ...(shouldUseRedisQueueInfra()
      ? [BullModule.registerQueue({ name: 'pdf-generation' })]
      : []),
    DocumentRegistryModule,
    CommonModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ...(!shouldUseRedisQueueInfra()
      ? [createRedisDisabledQueueProvider('pdf-generation')]
      : []),
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
