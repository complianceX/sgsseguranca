import { IsBoolean } from 'class-validator';

export class UpdateAiConsentDto {
  @IsBoolean()
  consent: boolean;
}
