import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePtApprovalRulesDto {
  @IsBoolean()
  @IsOptional()
  blockCriticalRiskWithoutEvidence?: boolean;

  @IsBoolean()
  @IsOptional()
  blockWorkerWithoutValidMedicalExam?: boolean;

  @IsBoolean()
  @IsOptional()
  blockWorkerWithExpiredBlockingTraining?: boolean;

  @IsBoolean()
  @IsOptional()
  requireAtLeastOneExecutante?: boolean;
}
