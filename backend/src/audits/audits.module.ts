import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditsService } from './audits.service';
import { AuditsController } from './audits.controller';
import { Audit } from './entities/audit.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { CommonModule } from '../common/common.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Audit, Company, User]),
    CommonModule,
    DocumentRegistryModule,
  ],
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule {}
