import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { TenantRestoreMode } from '../tenant-backup.types';

export class TenantRestoreDto {
  @IsIn(['overwrite_same_tenant', 'clone_to_new_tenant'])
  mode: TenantRestoreMode;

  @IsOptional()
  @IsString()
  backup_id?: string;

  @IsOptional()
  @IsUUID()
  target_company_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  target_company_name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  target_company_cnpj?: string;

  @IsOptional()
  @IsString()
  confirm_company_id?: string;

  @IsOptional()
  @IsString()
  confirm_phrase?: string;
}
