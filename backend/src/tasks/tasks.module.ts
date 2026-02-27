import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CleanupTask } from './cleanup.task';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CorrectiveActionsModule } from '../corrective-actions/corrective-actions.module';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), CorrectiveActionsModule],
  providers: [CleanupTask],
})
export class TasksModule {}
