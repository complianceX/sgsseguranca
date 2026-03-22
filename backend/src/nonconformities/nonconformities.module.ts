import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformitiesController } from './nonconformities.controller';
import { NonConformity } from './entities/nonconformity.entity';
import { CommonModule } from '../common/common.module';
import { Company } from '../companies/entities/company.entity';
import { AuditModule } from '../audit/audit.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';
import { Site } from '../sites/entities/site.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NonConformity, Company, Site]),
    CommonModule,
    AuditModule,
    DocumentRegistryModule,
    DocumentVideosModule,
  ],
  controllers: [NonConformitiesController],
  providers: [NonConformitiesService],
  exports: [NonConformitiesService],
})
export class NonConformitiesModule {}
