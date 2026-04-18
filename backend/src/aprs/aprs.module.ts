import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AprsService } from './aprs.service';
import { AprsController } from './aprs.controller';
import { Apr } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import { AprApprovalStep } from './entities/apr-approval-step.entity';
import { AprRiskItem } from './entities/apr-risk-item.entity';
import { AprRiskEvidence } from './entities/apr-risk-evidence.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { StorageModule } from '../common/storage/storage.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { PublicAprEvidenceController } from './public-apr-evidence.controller';
import { PublicAprVerificationController } from './public-apr-verification.controller';
import { SignaturesModule } from '../signatures/signatures.module';
import { AprRiskMatrixService } from './apr-risk-matrix.service';
import { AprExcelService } from './apr-excel.service';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { AprsPdfService } from './services/aprs-pdf.service';
import { AprsEvidenceService } from './services/aprs-evidence.service';
import { AprWorkflowService } from './aprs-workflow.service';
import { FileInspectionModule } from '../common/security/file-inspection.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Apr,
      AprLog,
      AprApprovalStep,
      AprRiskItem,
      AprRiskEvidence,
      Company,
    ]),
    CommonModule,
    forwardRef(() => AuthModule),
    StorageModule,
    DocumentRegistryModule,
    SignaturesModule,
    ForensicTrailModule,
    FileInspectionModule,
  ],
  controllers: [
    AprsController,
    PublicAprEvidenceController,
    PublicAprVerificationController,
  ],
  providers: [
    AprsService,
    AprRiskMatrixService,
    AprExcelService,
    AprsPdfService,
    AprsEvidenceService,
    AprWorkflowService,
  ],
  exports: [AprsService, AprWorkflowService],
})
export class AprsModule {}
