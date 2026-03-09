import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Training } from '../trainings/entities/training.entity';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { WorkerOperationalStatusService } from './worker-operational-status.service';
import { WorkerTimelineService } from './worker-timeline.service';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Profile,
      MedicalExam,
      Training,
      EpiAssignment,
      DocumentRegistryEntry,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, WorkerOperationalStatusService, WorkerTimelineService],
  exports: [UsersService, WorkerOperationalStatusService, WorkerTimelineService],
})
export class UsersModule {}
