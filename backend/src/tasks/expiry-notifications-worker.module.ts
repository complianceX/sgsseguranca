import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExpiryNotificationsProcessor } from './expiry-notifications.processor';
import { TrainingsModule } from '../trainings/trainings.module';
import { MedicalExamsModule } from '../medical-exams/medical-exams.module';
import { CommonModule } from '../common/common.module';

/**
 * Módulo exclusivo do processo worker.
 * NÃO deve ser importado pelo AppModule.
 * Registra o processor BullMQ para a fila 'expiry-notifications'.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'expiry-notifications' }),
    CommonModule,
    TrainingsModule,
    MedicalExamsModule,
  ],
  providers: [ExpiryNotificationsProcessor],
})
export class ExpiryNotificationsWorkerModule {}
