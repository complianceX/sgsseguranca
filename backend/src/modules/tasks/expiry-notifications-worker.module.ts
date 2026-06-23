import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExpiryNotificationsProcessor } from './expiry-notifications.processor';
import { TrainingsModule } from '../trainings/trainings.module';
import { MedicalExamsModule } from '../medical-exams/medical-exams.module';
import { EpisModule } from '../epis/epis.module';
import { CommonModule } from '../../shared/common.module';

/**
 * Modulo exclusivo do processo worker.
 * NAO deve ser importado pelo AppModule.
 * Registra o processor BullMQ para a fila 'expiry-notifications'.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'expiry-notifications' }),
    CommonModule,
    TrainingsModule,
    MedicalExamsModule,
    EpisModule,
  ],
  providers: [ExpiryNotificationsProcessor],
})
export class ExpiryNotificationsWorkerModule {}
