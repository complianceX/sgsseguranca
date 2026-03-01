import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PdfProcessor } from './pdf.processor';
import { ReportsModule } from './reports.module';
import { StorageModule } from '../storage/storage.module';

/**
 * Módulo exclusivo do processo worker.
 * NÃO deve ser importado pelo AppModule.
 *
 * Registra o processor BullMQ para as filas de geração de PDF.
 * Depende de:
 *   - ReportsModule (ReportsService)
 *   - StorageModule (StorageService)
 *   - ObservabilityModule @Global (MetricsService, TenantQuotaService)
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'pdf-generation' },
      { name: 'pdf-generation-dlq' },
    ),
    ReportsModule,
    StorageModule,
  ],
  providers: [PdfProcessor],
})
export class ReportsWorkerModule {}
