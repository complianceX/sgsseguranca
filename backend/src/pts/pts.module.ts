import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PtsService } from './pts.service';
import { PtsController } from './pts.controller';
import { Pt } from './entities/pt.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { TrainingsModule } from '../trainings/trainings.module';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pt, Company, User]),
    CommonModule,
    AuthModule,
    TrainingsModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [PtsController],
  providers: [PtsService],
  exports: [PtsService],
})
export class PtsModule {}
