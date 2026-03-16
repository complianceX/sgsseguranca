import { Exclude, Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';
import { CompanyResponseDto } from '../../companies/dto/company-response.dto';

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
  status: string;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  inspetor_id: string;

  @Expose()
  itens: any;

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

  @Expose()
  pdf_file_key: string;

  @Expose()
  pdf_folder_path: string;

  @Expose()
  pdf_original_name: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => UserResponseDto)
  inspetor: UserResponseDto;

  @Expose()
  @Type(() => SiteResponseDto)
  site: SiteResponseDto;

  @Expose()
  @Type(() => CompanyResponseDto)
  company: CompanyResponseDto;
}
