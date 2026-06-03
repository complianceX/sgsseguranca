import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalExam } from './entities/medical-exam.entity';
import { MedicalExamsController } from './medical-exams.controller';
import { MedicalExamsService } from './medical-exams.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([MedicalExam]), UsersModule],
  controllers: [MedicalExamsController],
  providers: [MedicalExamsService],
  exports: [MedicalExamsService],
})
export class MedicalExamsModule {}
