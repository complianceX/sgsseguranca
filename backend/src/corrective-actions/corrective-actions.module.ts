import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CorrectiveAction } from './entities/corrective-action.entity';
import { CorrectiveActionsService } from './corrective-actions.service';
import { CorrectiveActionsController } from './corrective-actions.controller';
import { SlaEscalationProcessor } from './sla-escalation.processor';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { AuditsModule } from '../audits/audits.module';
import { CommonModule } from '../common/common.module';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CorrectiveAction, User, Notification]),
    BullModule.registerQueue({ name: 'sla-escalation' }),
    NonConformitiesModule,
    AuditsModule,
    CommonModule,
    NotificationsModule,
  ],
  controllers: [CorrectiveActionsController],
  providers: [CorrectiveActionsService, SlaEscalationProcessor],
  exports: [CorrectiveActionsService],
})
export class CorrectiveActionsModule {}
