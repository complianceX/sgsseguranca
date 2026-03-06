import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformitiesController } from './nonconformities.controller';
import { NonConformity } from './entities/nonconformity.entity';
import { CommonModule } from '../common/common.module';
import { Company } from '../companies/entities/company.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NonConformity, Company]),
    CommonModule,
    AuditModule,
  ],
  controllers: [NonConformitiesController],
  providers: [NonConformitiesService],
  exports: [NonConformitiesService],
})
export class NonConformitiesModule {}
