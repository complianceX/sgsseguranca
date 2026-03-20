import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentRegistryEntry } from './entities/document-registry.entity';
import { DocumentRegistryService } from './document-registry.service';
import { DocumentRegistryController } from './document-registry.controller';
import { PublicDocumentRegistryController } from './public-document-registry.controller';
import { DocumentGovernanceService } from './document-governance.service';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentRegistryEntry]),
    CommonModule,
    AuthModule,
    ForensicTrailModule,
  ],
  controllers: [DocumentRegistryController, PublicDocumentRegistryController],
  providers: [DocumentRegistryService, DocumentGovernanceService],
  exports: [DocumentRegistryService, DocumentGovernanceService],
})
export class DocumentRegistryModule {}
