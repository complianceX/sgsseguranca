import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apr } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Company } from '../companies/entities/company.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Report } from '../reports/entities/report.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { DashboardService } from './dashboard.service';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Apr,
      Audit,
      Checklist,
      Inspection,
      Training,
      NonConformity,
      Cat,
      Company,
      Dds,
      Epi,
      Pt,
      Report,
      Site,
      User,
      MonthlySnapshot,
      Notification,
      MedicalExam,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardPendingQueueService],
  exports: [DashboardService],
})
export class DashboardModule {}
