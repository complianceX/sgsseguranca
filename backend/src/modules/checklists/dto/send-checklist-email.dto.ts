import { IsEmail } from 'class-validator';

export class SendChecklistEmailDto {
  @IsEmail({}, { message: 'Email inválido' })
  to: string;
}
