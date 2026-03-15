import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PtPreApprovalRulesDto {
  @IsBoolean()
  blockCriticalRiskWithoutEvidence: boolean;

  @IsBoolean()
  blockWorkerWithoutValidMedicalExam: boolean;

  @IsBoolean()
  blockWorkerWithExpiredBlockingTraining: boolean;

  @IsBoolean()
  requireAtLeastOneExecutante: boolean;
}

class PtPreApprovalWorkerStatusDto {
  @IsUUID()
  userId: string;

  @IsString()
  nome: string;

  @IsString()
  roleLabel: string;

  @IsBoolean()
  blocked: boolean;

  @IsOptional()
  @IsBoolean()
  unavailable?: boolean;

  @IsArray()
  @IsString({ each: true })
  reasons: string[];
}

class PtPreApprovalChecklistDto {
  @IsBoolean()
  reviewedReadiness: boolean;

  @IsBoolean()
  reviewedWorkers: boolean;

  @IsBoolean()
  confirmedRelease: boolean;
}

export class LogPreApprovalReviewDto {
  @IsIn(['preview', 'approval_requested'])
  stage: 'preview' | 'approval_requested';

  @IsBoolean()
  readyForRelease: boolean;

  @IsArray()
  @IsString({ each: true })
  blockers: string[];

  @IsInt()
  @Min(0)
  unansweredChecklistItems: number;

  @IsInt()
  @Min(0)
  adverseChecklistItems: number;

  @IsInt()
  @Min(0)
  pendingSignatures: number;

  @IsBoolean()
  hasRapidRiskBlocker: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PtPreApprovalWorkerStatusDto)
  workerStatuses: PtPreApprovalWorkerStatusDto[];

  @IsArray()
  @IsString({ each: true })
  warnings: string[];

  @ValidateNested()
  @Type(() => PtPreApprovalRulesDto)
  @IsOptional()
  rules?: PtPreApprovalRulesDto;

  @ValidateNested()
  @Type(() => PtPreApprovalChecklistDto)
  @IsOptional()
  checklist?: PtPreApprovalChecklistDto;
}
