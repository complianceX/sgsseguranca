import { Exclude, Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';
import { CompanyResponseDto } from '../../companies/dto/company-response.dto';
import { ChecklistItemDto } from './checklist-item.dto';
import { ChecklistTopicDto } from './checklist-topic.dto';
import type { ChecklistStatus } from '../types/checklist-item.type';

@Exclude()
export class ChecklistResponseDto {
  @Expose()
  id: string;

  @Expose()
  titulo: string;

  @Expose()
  descricao: string;

  @Expose()
  equipamento: string;

  @Expose()
  maquina: string;

  @Expose()
  foto_equipamento: string;

  @Expose()
  data: Date;

  @Expose()
  status: ChecklistStatus;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  inspetor_id: string;

  @Expose()
  @Type(() => ChecklistItemDto)
  itens: ChecklistItemDto[];

  @Expose()
  @Type(() => ChecklistTopicDto)
  topicos?: ChecklistTopicDto[];

  @Expose()
  is_modelo: boolean;

  @Expose()
  ativo: boolean;

  @Expose()
  categoria: string;

  @Expose()
  periodicidade: string;

  @Expose()
  nivel_risco_padrao: string;

  @Expose()
  auditado_por_id: string;

  @Expose()
  data_auditoria: Date;

  @Expose()
  resultado_auditoria: string;

  @Expose()
  notas_auditoria: string;

  // SECURITY: do not expose raw internal storage keys in checklist responses.
  // Use dedicated governed access endpoints (GET /:id/pdf , /photos/.../access) which return temporary signed URLs.
  // pdf_file_key / pdf_folder_path / pdf_original_name are stored internally but stripped from API JSON output.

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => UserResponseDto)
  inspetor: UserResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  auditado_por: UserResponseDto;

  @Expose()
  @Type(() => SiteResponseDto)
  site: SiteResponseDto;

  @Expose()
  @Type(() => CompanyResponseDto)
  company: CompanyResponseDto;
}
