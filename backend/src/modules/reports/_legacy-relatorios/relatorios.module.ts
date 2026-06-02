import { Module } from '@nestjs/common';
import { ReportsModule } from './reports.module';
import { PhotographicReportsModule } from './photographic-reports.module';
import { RdosModule } from './rdos.module';

@Module({
  imports: [ReportsModule, PhotographicReportsModule, RdosModule],
  exports: [ReportsModule, PhotographicReportsModule, RdosModule],
})
export class RelatoriosModule {}
