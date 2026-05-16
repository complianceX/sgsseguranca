import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { AiModule } from '../ai/ai.module';
import { PhotographicReportsController } from './photographic-reports.controller';
import { PhotographicReportsService } from './photographic-reports.service';
import { PhotographicReport } from './entities/photographic-report.entity';
import { PhotographicReportDay } from './entities/photographic-report-day.entity';
import { PhotographicReportImage } from './entities/photographic-report-image.entity';
import { PhotographicReportExport } from './entities/photographic-report-export.entity';

@Module({
  imports: [
    CommonModule,
    DocumentRegistryModule,
    AiModule,
    TypeOrmModule.forFeature([
      PhotographicReport,
      PhotographicReportDay,
      PhotographicReportImage,
      PhotographicReportExport,
    ]),
  ],
  controllers: [PhotographicReportsController],
  providers: [PhotographicReportsService],
  exports: [PhotographicReportsService],
})
export class PhotographicReportsModule {}
