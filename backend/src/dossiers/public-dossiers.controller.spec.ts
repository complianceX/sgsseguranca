import { BadRequestException } from '@nestjs/common';
import { PublicDossiersController } from './public-dossiers.controller';
import type { DossiersService } from './dossiers.service';
import { signValidationToken } from '../common/security/validation-token.util';

describe('PublicDossiersController', () => {
  let controller: PublicDossiersController;
  let dossiersService: Pick<
    DossiersService,
    'validateByCode' | 'validateByCodeLegacy'
  >;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    dossiersService = {
      validateByCode: jest.fn(),
      validateByCodeLegacy: jest.fn(),
    };

    controller = new PublicDossiersController(
      dossiersService as DossiersService,
    );
  });

  it('valida dossie com token no novo contrato público', async () => {
    (dossiersService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });
    const token = signValidationToken({
      code: 'DOS-EMP-ABCDEF12',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({ code: 'DOS-EMP-ABCDEF12', token }),
    ).resolves.toEqual({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });
  });

  it('mantém compatibilidade legada quando habilitada', async () => {
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'true';
    (dossiersService.validateByCodeLegacy as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });

    await expect(
      controller.validateByCode({ code: 'DOS-EMP-ABCDEF12' }),
    ).resolves.toEqual({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(
      controller.validateByCode({ code: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
