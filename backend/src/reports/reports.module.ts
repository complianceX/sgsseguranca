import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CompaniesModule } from '../companies/companies.module';
import { EpisModule } from '../epis/epis.module';
import { TrainingsModule } from '../trainings/trainings.module';
@Module({
  imports: [
    BullModule.registerQueue({ name: 'pdf-generation' }),
    CompaniesModule,
    EpisModule,
    TrainingsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
