import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailProcessor } from './mail.processor';
import { MailModule } from './mail.module';

/**
 * Módulo exclusivo do processo worker.
 * NÃO deve ser importado pelo AppModule.
 *
 * Registra o processor BullMQ para as filas de e-mail.
 * Depende de:
 *   - MailModule (MailService)
 *   - ObservabilityModule @Global (MetricsService, TenantQuotaService)
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'mail' }, { name: 'mail-dlq' }),
    MailModule,
  ],
  providers: [MailProcessor],
})
export class MailWorkerModule {}
