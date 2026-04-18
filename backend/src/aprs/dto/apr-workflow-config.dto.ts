import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowCriticality } from '../entities/apr-workflow-config.entity';
import { WorkflowStepRole } from '../entities/apr-workflow-step.entity';

export class CreateWorkflowStepDto {
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsEnum(WorkflowStepRole)
  roleName: WorkflowStepRole;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  canDelegate?: boolean;

  @IsInt()
  @IsOptional()
  timeoutHours?: number | null;
}

export class CreateWorkflowConfigDto {
  @IsUUID()
  @IsOptional()
  tenantId?: string | null;

  @IsUUID()
  @IsOptional()
  siteId?: string | null;

  @IsString()
  @MaxLength(60)
  @IsOptional()
  activityType?: string | null;

  @IsEnum(WorkflowCriticality)
  @IsOptional()
  criticality?: WorkflowCriticality | null;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStepDto)
  @IsOptional()
  steps?: CreateWorkflowStepDto[];
}

export class UpdateWorkflowConfigDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ReplaceWorkflowStepsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStepDto)
  steps: CreateWorkflowStepDto[];
}

export class WorkflowApproveDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class WorkflowRejectDto {
  @IsString()
  reason: string;
}

export class WorkflowReopenDto {
  @IsString()
  reason: string;
}
