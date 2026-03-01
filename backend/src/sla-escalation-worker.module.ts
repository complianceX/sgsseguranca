import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SlaEscalationProcessor } from './corrective-actions/sla-escalation.processor';
import { CorrectiveActionsModule } from './corrective-actions/corrective-actions.module';
import { CommonModule } from './common/common.module';

/**
 * Módulo exclusivo do processo worker.
 * NÃO deve ser importado pelo AppModule.
 * Registra o processor BullMQ para a fila 'sla-escalation'.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'sla-escalation' }),
    CommonModule,
    CorrectiveActionsModule,
  ],
  providers: [SlaEscalationProcessor],
})
export class SlaEscalationWorkerModule {}
