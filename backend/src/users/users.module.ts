import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { TenantRequiredGuard } from '../common/guards/tenant-required.guard';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Training } from '../trainings/entities/training.entity';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { WorkerOperationalStatusService } from './worker-operational-status.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Profile,
      MedicalExam,
      Training,
      EpiAssignment,
    ]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    WorkerOperationalStatusService,
    {
      provide: APP_GUARD,
      useClass: TenantRequiredGuard,
    },
  ],
  exports: [UsersService, WorkerOperationalStatusService],
})
export class UsersModule {}
