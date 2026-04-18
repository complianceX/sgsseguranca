import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DdsApprovalStepInputDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  approver_role: string;
}

export class InitializeDdsApprovalFlowDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => DdsApprovalStepInputDto)
  @IsOptional()
  steps?: DdsApprovalStepInputDto[];
}

export class DecideDdsApprovalDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos numéricos.' })
  pin: string;
}

export class ReopenDdsApprovalFlowDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos numéricos.' })
  pin: string;
}
