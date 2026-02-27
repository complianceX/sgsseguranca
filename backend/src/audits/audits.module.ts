import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditsService } from './audits.service';
import { AuditsController } from './audits.controller';
import { Audit } from './entities/audit.entity';
import { Company } from '../companies/entities/company.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Audit, Company]), CommonModule],
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule {}
