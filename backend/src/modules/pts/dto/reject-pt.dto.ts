import { IsNotEmpty, IsString } from 'class-validator';

export class RejectPtDto {
  @IsString()
  @IsNotEmpty({ message: 'O motivo da rejeição é obrigatório.' })
  reason: string;
}
