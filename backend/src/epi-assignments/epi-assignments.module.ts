import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { Epi } from '../epis/entities/epi.entity';
import { User } from '../users/entities/user.entity';
import { EpiAssignmentsController } from './epi-assignments.controller';
import { EpiAssignmentsService } from './epi-assignments.service';
import { EpiAssignment } from './entities/epi-assignment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EpiAssignment, Epi, User]),
    CommonModule,
    AuditModule,
  ],
  controllers: [EpiAssignmentsController],
  providers: [EpiAssignmentsService],
  exports: [EpiAssignmentsService],
})
export class EpiAssignmentsModule {}
