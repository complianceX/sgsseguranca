import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apr } from '../aprs/entities/apr.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Apr,
      Inspection,
      Training,
      NonConformity,
      Cat,
      Pt,
      Site,
      MonthlySnapshot,
      Notification,
      MedicalExam,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
