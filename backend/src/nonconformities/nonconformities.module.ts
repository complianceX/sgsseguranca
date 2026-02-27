import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformitiesController } from './nonconformities.controller';
import { NonConformity } from './entities/nonconformity.entity';
import { CommonModule } from '../common/common.module';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NonConformity, Company]), CommonModule],
  controllers: [NonConformitiesController],
  providers: [NonConformitiesService],
  exports: [NonConformitiesService],
})
export class NonConformitiesModule {}
