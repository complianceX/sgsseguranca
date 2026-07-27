import {
  IsEnum,
  IsBoolean,
  IsEmpty,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class CreateRiskDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Nome do risco é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Categoria é obrigatória' })
  categoria: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  medidas_controle?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  probability?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  severity?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  exposure?: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @IsOptional()
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsEnum([
    'ELIMINATION',
    'SUBSTITUTION',
    'ENGINEERING',
    'ADMINISTRATIVE',
    'PPE',
  ])
  @IsOptional()
  control_hierarchy?:
    'ELIMINATION' | 'SUBSTITUTION' | 'ENGINEERING' | 'ADMINISTRATIVE' | 'PPE';

  @IsString()
  @IsOptional()
  evidence_photo?: string;

  @IsString()
  @IsOptional()
  evidence_document?: string;

  @IsString()
  @IsOptional()
  control_description?: string;

  @IsBoolean()
  @IsOptional()
  control_evidence?: boolean;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;
}
