import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateCorrectiveActionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsIn(['manual', 'nonconformity', 'audit'])
  source_type?: 'manual' | 'nonconformity' | 'audit';

  @IsOptional()
  @IsUUID('4')
  source_id?: string;

  @IsOptional()
  @IsUUID('4')
  site_id?: string;

  @IsOptional()
  @IsUUID('4')
  responsible_user_id?: string;

  @IsOptional()
  @IsString()
  responsible_name?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'done', 'overdue', 'cancelled'])
  status?: 'open' | 'in_progress' | 'done' | 'overdue' | 'cancelled';

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsInt()
  @Min(1)
  sla_days?: number;

  @IsOptional()
  @IsString()
  evidence_notes?: string;
}

export class UpdateCorrectiveActionStatusDto {
  @IsIn(['open', 'in_progress', 'done', 'overdue', 'cancelled'])
  status: 'open' | 'in_progress' | 'done' | 'overdue' | 'cancelled';

  @IsOptional()
  @IsString()
  evidence_notes?: string;
}
