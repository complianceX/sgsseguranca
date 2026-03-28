import { BadRequestException } from '@nestjs/common';
import { PublicCatsController } from './public-cats.controller';
import type { CatsService } from './cats.service';
import { signValidationToken } from '../common/security/validation-token.util';

describe('PublicCatsController', () => {
  let controller: PublicCatsController;
  let catsService: Pick<CatsService, 'validateByCode' | 'validateByCodeLegacy'>;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    catsService = {
      validateByCode: jest.fn(),
      validateByCodeLegacy: jest.fn(),
    };

    controller = new PublicCatsController(catsService as CatsService);
  });

  it('valida CAT com token no novo contrato público', async () => {
    (catsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });
    const token = signValidationToken({
      code: 'CAT-2026-ABCDEF12',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({ code: 'CAT-2026-ABCDEF12', token }),
    ).resolves.toEqual({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });
  });

  it('mantém compatibilidade legada quando habilitada', async () => {
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'true';
    (catsService.validateByCodeLegacy as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });

    await expect(
      controller.validateByCode({ code: 'CAT-2026-ABCDEF12' }),
    ).resolves.toEqual({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(controller.validateByCode({ code: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
