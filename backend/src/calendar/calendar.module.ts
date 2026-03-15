import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from '../trainings/entities/training.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Rdo } from '../rdos/entities/rdo.entity';
import { Cat } from '../cats/entities/cat.entity';
import { ServiceOrder } from '../service-orders/entities/service-order.entity';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Training,
      MedicalExam,
      Dds,
      Rdo,
      Cat,
      ServiceOrder,
    ]),
    CommonModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
