import { BadRequestException } from '@nestjs/common';
import { PublicCatsController } from './public-cats.controller';
import type { CatsService } from './cats.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

describe('PublicCatsController', () => {
  let controller: PublicCatsController;
  let catsService: Pick<CatsService, 'validateByCode'>;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    catsService = {
      validateByCode: jest.fn(),
    };
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicCatsController(
      catsService as CatsService,
      publicValidationGrantService as PublicValidationGrantService,
    );
  });

  it('valida CAT com grant/token ativo no contrato público', async () => {
    (catsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'CAT-2026-ABCDEF12',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({
        code: 'CAT-2026-ABCDEF12',
        token: 'token-valido',
      }),
    ).resolves.toEqual({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });
  });

  it('retorna inválido quando o grant/token é rejeitado', async () => {
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockRejectedValue(new Error('invalid_token'));

    await expect(
      controller.validateByCode({
        code: 'CAT-2026-ABCDEF12',
        token: 'token-invalido',
      }),
    ).resolves.toEqual({
      valid: false,
      code: 'CAT-2026-ABCDEF12',
      message: 'Código inválido ou expirado.',
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(
      controller.validateByCode({ code: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
