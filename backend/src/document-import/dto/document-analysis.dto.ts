import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  IsNumber,
  IsEnum,
  IsObject,
  IsBoolean,
} from 'class-validator';

export class DocumentAnalysisDto {
  @IsString()
  @IsOptional()
  empresa?: string;

  @IsString()
  @IsOptional()
  cnpj?: string;

  @IsDate()
  @IsOptional()
  data?: Date | null;

  @IsString()
  @IsOptional()
  responsavelTecnico?: string;

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsArray()
  @IsOptional()
  nrsCitadas?: string[];

  @IsArray()
  @IsOptional()
  riscos?: string[];

  @IsArray()
  @IsOptional()
  epis?: string[];

  @IsArray()
  @IsOptional()
  assinaturas?: string[];

  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @IsString()
  @IsOptional()
  tema?: string;

  @IsString()
  @IsOptional()
  conteudo?: string;

  @IsString()
  @IsOptional()
  resumo?: string;

  @IsString()
  @IsOptional()
  site_id?: string;

  @IsString()
  @IsOptional()
  facilitador_id?: string;

  @IsNumber()
  @IsOptional()
  scoreConfianca?: number;

  @IsObject()
  @IsOptional()
  camposEstruturados?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  tipoNormalizado?: string;
}

export class DocumentValidationResultDto {
  @IsEnum(['VALIDO', 'INCOMPLETO', 'CRITICO'])
  status!: 'VALIDO' | 'INCOMPLETO' | 'CRITICO';

  @IsArray()
  pendencias!: string[];

  @IsNumber()
  scoreConfianca!: number;
}

export class DocumentImportResponseDto {
  @IsBoolean()
  success!: boolean;

  @IsString()
  documentId!: string;

  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @IsString()
  @IsOptional()
  tipoDocumentoDescricao?: string;

  @IsObject()
  @IsOptional()
  analysis?: DocumentAnalysisDto;

  @IsObject()
  @IsOptional()
  validation?: DocumentValidationResultDto;

  @IsObject()
  @IsOptional()
  metadata?: {
    tamanhoArquivo: number;
    quantidadeTexto: number;
    hash: string;
    timestamp: Date;
    scoreClassificacao?: number;
    textoExtraidoLength?: number;
    validacao?: any;
    erro?: string;
    timestampFalha?: Date;
    status?: string;
  };

  @IsString()
  @IsOptional()
  mensagem?: string;

  @IsString()
  @IsOptional()
  textoExtraido?: string;
}
