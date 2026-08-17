import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateDdsDto } from './create-dds.dto';
import { UpdateDdsDto } from './update-dds.dto';

const metadataFor = (
  metatype: typeof CreateDdsDto | typeof UpdateDdsDto,
): ArgumentMetadata => ({
  type: 'body',
  metatype,
  data: undefined,
});

describe('DDS write DTO boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('rejects audit fields on generic create payloads', async () => {
    await expect(
      pipe.transform(
        {
          tema: 'Trabalho em altura',
          data: '2026-08-16',
          site_id: '11111111-1111-4111-8111-111111111111',
          facilitador_id: '22222222-2222-4222-8222-222222222222',
          auditado_por_id: '33333333-3333-4333-8333-333333333333',
        },
        metadataFor(CreateDdsDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects audit fields on generic update payloads', async () => {
    await expect(
      pipe.transform(
        {
          tema: 'Trabalho em altura',
          resultado_auditoria: 'Conforme',
        },
        metadataFor(UpdateDdsDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
