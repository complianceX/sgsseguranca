import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrivacyGovernanceAdminController } from './privacy-governance-admin.controller';
import { PrivacyGovernanceController } from './privacy-governance.controller';
import { PrivacyGovernanceService } from './privacy-governance.service';

@Module({
  imports: [CommonModule],
  controllers: [PrivacyGovernanceController, PrivacyGovernanceAdminController],
  providers: [PrivacyGovernanceService],
})
export class PrivacyGovernanceModule {}
