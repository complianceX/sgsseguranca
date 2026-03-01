import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorrectiveAction } from './entities/corrective-action.entity';
import { CorrectiveActionsService } from './corrective-actions.service';
import { CorrectiveActionsController } from './corrective-actions.controller';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { AuditsModule } from '../audits/audits.module';
import { CommonModule } from '../common/common.module';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CorrectiveAction, User, Notification]),
    NonConformitiesModule,
    AuditsModule,
    CommonModule,
    NotificationsModule,
  ],
  controllers: [CorrectiveActionsController],
  providers: [CorrectiveActionsService],
  exports: [CorrectiveActionsService],
})
export class CorrectiveActionsModule {}
