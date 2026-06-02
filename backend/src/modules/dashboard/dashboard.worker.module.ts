import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DashboardModule } from './dashboard.module';
import { DashboardDocumentAvailabilityRefreshSchedulerService } from './dashboard-document-availability-refresh.scheduler';
import { DashboardRevalidateProcessor } from './dashboard-revalidate.processor';

/**
 * Worker-only module.
 *
 * IMPORTANTE:
 * - Não importar no AppModule (web), para evitar jobs competindo com requests.
 * - Importar apenas no WorkerModule.
 */
@Module({
  imports: [
    // Garante que o token da fila exista no contexto do worker.
    BullModule.registerQueue({ name: 'dashboard-revalidate' }),
    DashboardModule,
  ],
  providers: [
    DashboardRevalidateProcessor,
    DashboardDocumentAvailabilityRefreshSchedulerService,
  ],
})
export class DashboardWorkerModule {}
