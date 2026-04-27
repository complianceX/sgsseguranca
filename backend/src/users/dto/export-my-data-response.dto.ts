import { ApiProperty } from '@nestjs/swagger';

export class ExportMyDataProfileSummaryDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID do perfil do usuário.',
  })
  id: string;

  @ApiProperty({
    example: 'Administrador da Empresa',
    description: 'Nome do perfil do usuário.',
  })
  nome: string;
}

export class ExportMyDataSiteSummaryDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174001',
    description: 'ID do site vinculado ao usuário.',
  })
  id: string;

  @ApiProperty({
    example: 'Unidade Matriz',
    description: 'Nome do site vinculado ao usuário.',
  })
  nome: string;
}

export class ExportMyDataUserProfileDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174002',
    description: 'ID do usuário.',
  })
  id: string;

  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome completo do titular.',
  })
  nome: string;

  @ApiProperty({
    example: '12345678900',
    nullable: true,
    description: 'CPF do titular.',
  })
  cpf: string | null;

  @ApiProperty({
    example: 'joao@empresa.com',
    nullable: true,
    description: 'E-mail do titular.',
  })
  email: string | null;

  @ApiProperty({
    example: 'Técnico de Segurança',
    nullable: true,
    description: 'Função/cargo do titular.',
  })
  funcao: string | null;

  @ApiProperty({
    example: true,
    description: 'Status operacional do usuário.',
  })
  status: boolean;

  @ApiProperty({
    example: true,
    description: 'Consentimento do titular para processamento por IA.',
  })
  ai_processing_consent: boolean;

  @ApiProperty({
    type: () => ExportMyDataProfileSummaryDto,
    nullable: true,
    description: 'Perfil do usuário no sistema.',
  })
  profile: ExportMyDataProfileSummaryDto | null;

  @ApiProperty({
    type: () => ExportMyDataSiteSummaryDto,
    nullable: true,
    description: 'Site vinculado ao usuário.',
  })
  site: ExportMyDataSiteSummaryDto | null;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174003',
    description: 'ID da empresa controladora dos dados.',
  })
  company_id: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-25T12:34:56.000Z',
    description: 'Data de criação do cadastro.',
  })
  created_at: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-25T12:34:56.000Z',
    description: 'Data da última atualização do cadastro.',
  })
  updated_at: string;
}

export class ExportMyDataConsentEventDto {
  @ApiProperty({ example: 'ai_processing' })
  type: string;

  @ApiProperty({ example: '2026-04-24' })
  versionLabel: string;

  @ApiProperty({ example: 'sha256:abc123' })
  bodyHash: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt: string | null;

  @ApiProperty({ example: false })
  migratedFromLegacy: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  recordedAt: string;
}

export class ExportMyDataProcessingSummaryDto {
  @ApiProperty({ example: 'medical_exams' })
  area: string;

  @ApiProperty({
    example: 'Exames médicos ocupacionais vinculados ao titular.',
  })
  description: string;

  @ApiProperty({ example: 2 })
  count: number;

  @ApiProperty({ example: 'obrigacao_legal_ou_execucao_contrato' })
  likelyLegalBasis: string;

  @ApiProperty({ example: 'sensivel_saude_ocupacional' })
  sensitivity: string;
}

export class ExportMyDataExportLimitationDto {
  @ApiProperty({ example: 'documentos_sst' })
  area: string;

  @ApiProperty({
    example:
      'Documentos de SST podem conter dados de terceiros e dependem de validação do controlador.',
  })
  reason: string;
}

export class ExportMyDataResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-25T12:34:56.000Z',
    description: 'Timestamp único da exportação.',
  })
  exportedAt: string;

  @ApiProperty({
    example: 'SGS — Sistema de Gestão de Segurança',
    description: 'Nome do controlador dos dados.',
  })
  dataController: string;

  @ApiProperty({
    example: 'LGPD Art. 20 — Portabilidade de dados pessoais',
    description: 'Base legal da exportação.',
  })
  legalBasis: string;

  @ApiProperty({
    type: () => ExportMyDataUserProfileDto,
    description: 'Dados pessoais exportados do titular autenticado.',
  })
  profile: ExportMyDataUserProfileDto;

  @ApiProperty({
    type: () => [ExportMyDataConsentEventDto],
    description: 'Histórico de consentimentos/aceites versionados do titular.',
  })
  consents: ExportMyDataConsentEventDto[];

  @ApiProperty({
    type: () => [ExportMyDataProcessingSummaryDto],
    description:
      'Inventário de áreas do sistema em que há dados vinculados ao titular.',
  })
  processingSummary: ExportMyDataProcessingSummaryDto[];

  @ApiProperty({
    type: () => [ExportMyDataExportLimitationDto],
    description:
      'Limitações objetivas para exportação automática de dados/documentos que dependem do controlador.',
  })
  limitations: ExportMyDataExportLimitationDto[];
}
