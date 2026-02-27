import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CompaniesModule } from '../companies/companies.module';
import { EpisModule } from '../epis/epis.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { PdfProcessor } from './pdf.processor';

@Module({
  imports: [
    CompaniesModule,
    EpisModule,
    TrainingsModule,
    // Adicione aqui outros módulos necessários para buscar dados para os relatórios
    BullModule.registerQueue({
      name: 'pdf-generation',
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, PdfProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
