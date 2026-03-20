import { Expose, Type } from 'class-transformer';
import { AprRiskItemInputDto } from './apr-risk-item-input.dto';

export class AprExcelImportDraftDto {
  @Expose()
  numero?: string;

  @Expose()
  titulo?: string;

  @Expose()
  descricao?: string;

  @Expose()
  data_inicio?: string;

  @Expose()
  data_fim?: string;

  @Expose()
  company_name?: string;

  @Expose()
  cnpj?: string;

  @Expose()
  site_name?: string;

  @Expose()
  unidade_setor?: string;

  @Expose()
  local_atividade?: string;

  @Expose()
  elaborador_name?: string;

  @Expose()
  aprovador_name?: string;

  @Expose()
  @Type(() => AprRiskItemInputDto)
  risk_items: AprRiskItemInputDto[];
}

export class AprExcelImportPreviewDto {
  @Expose()
  fileName: string;

  @Expose()
  sheetName: string;

  @Expose()
  importedRows: number;

  @Expose()
  ignoredRows: number;

  @Expose()
  warnings: string[];

  @Expose()
  errors: string[];

  @Expose()
  matchedColumns: Record<string, string>;

  @Expose()
  @Type(() => AprExcelImportDraftDto)
  draft: AprExcelImportDraftDto;
}
