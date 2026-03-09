import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Apr } from '../aprs/entities/apr.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { CompaniesModule } from '../companies/companies.module';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Training } from '../trainings/entities/training.entity';

const isRedisDisabled = /^true$/i.test(process.env.REDIS_DISABLED || '');

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Apr, Checklist, Dds, Epi, Pt, Training]),
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'pdf-generation' })]),
    CompaniesModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ...(isRedisDisabled
      ? [
          {
            provide: getQueueToken('pdf-generation'),
            useValue: {
              add: async () => {
                throw new Error(
                  'Fila de relatórios desabilitada (REDIS_DISABLED=true).',
                );
              },
              getJob: async () => null,
            },
          },
        ]
      : []),
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
