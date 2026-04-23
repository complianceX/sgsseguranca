import { BadRequestException } from '@nestjs/common';
import { PublicDossiersController } from './public-dossiers.controller';
import type { DossiersService } from './dossiers.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

describe('PublicDossiersController', () => {
  let controller: PublicDossiersController;
  let dossiersService: Pick<DossiersService, 'validateByCode'>;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    dossiersService = {
      validateByCode: jest.fn(),
    };
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicDossiersController(
      dossiersService as DossiersService,
      publicValidationGrantService as PublicValidationGrantService,
    );
  });

  it('valida dossie com grant/token ativo no contrato público', async () => {
    (dossiersService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'DOS-EMP-ABCDEF12',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({
        code: 'DOS-EMP-ABCDEF12',
        token: 'token-valido',
      }),
    ).resolves.toEqual({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
    });
  });

  it('retorna inválido quando o grant/token é rejeitado', async () => {
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockRejectedValue(new Error('invalid_token'));

    await expect(
      controller.validateByCode({
        code: 'DOS-EMP-ABCDEF12',
        token: 'token-invalido',
      }),
    ).resolves.toEqual({
      valid: false,
      code: 'DOS-EMP-ABCDEF12',
      message: 'Código inválido ou expirado.',
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(
      controller.validateByCode({ code: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
