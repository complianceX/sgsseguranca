import { Matches, MaxLength } from 'class-validator';

export class DownloadTokenParamDto {
  @MaxLength(4096)
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  token: string;
}
