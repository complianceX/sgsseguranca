import { Exclude, Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';

@Exclude()
export class InspectionResponseDto {
  @Expose()
  id: string;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  setor_area: string;

  @Expose()
  tipo_inspecao: string;

  @Expose()
  data_inspecao: Date;

  @Expose()
  horario: string;

  @Expose()
  responsavel_id: string;

  @Expose()
  objetivo: string;

  @Expose()
  descricao_local_atividades: string;

  @Expose()
  metodologia: string[];

  @Expose()
  perigos_riscos: any[];

  @Expose()
  plano_acao: any[];

  @Expose()
  evidencias: any[];

  @Expose()
  conclusao: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => UserResponseDto)
  responsavel: UserResponseDto;

  @Expose()
  @Type(() => SiteResponseDto)
  site: SiteResponseDto;
}
