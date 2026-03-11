import { IsHexColor, IsOptional } from 'class-validator';

export class UpdateSystemThemeDto {
  @IsOptional()
  @IsHexColor()
  backgroundColor?: string;

  @IsOptional()
  @IsHexColor()
  sidebarColor?: string;

  @IsOptional()
  @IsHexColor()
  cardColor?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsHexColor()
  textPrimary?: string;

  @IsOptional()
  @IsHexColor()
  textSecondary?: string;

  @IsOptional()
  @IsHexColor()
  successColor?: string;

  @IsOptional()
  @IsHexColor()
  warningColor?: string;

  @IsOptional()
  @IsHexColor()
  dangerColor?: string;

  @IsOptional()
  @IsHexColor()
  infoColor?: string;
}
