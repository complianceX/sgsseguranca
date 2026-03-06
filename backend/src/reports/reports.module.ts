import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { CompaniesModule } from '../companies/companies.module';
import { EpisModule } from '../epis/epis.module';
import { TrainingsModule } from '../trainings/trainings.module';

const isRedisDisabled = /^true$/i.test(process.env.REDIS_DISABLED || '');

@Module({
  imports: [
    TypeOrmModule.forFeature([Report]),
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'pdf-generation' })]),
    CompaniesModule,
    EpisModule,
    TrainingsModule,
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
