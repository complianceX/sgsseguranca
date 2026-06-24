import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendChecklistEmailDto {
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  to: string;
}
