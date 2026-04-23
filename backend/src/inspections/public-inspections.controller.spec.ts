import { BadRequestException } from '@nestjs/common';
import { PublicInspectionsController } from './public-inspections.controller';
import type { InspectionsService } from './inspections.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

describe('PublicInspectionsController', () => {
  let controller: PublicInspectionsController;
  let inspectionsService: Pick<InspectionsService, 'validateByCode'>;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    inspectionsService = {
      validateByCode: jest.fn(),
    };
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicInspectionsController(
      inspectionsService as InspectionsService,
      publicValidationGrantService as PublicValidationGrantService,
    );
  });

  it('retorna o payload público de inspeção validada por grant/token', async () => {
    (inspectionsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'INS-2026-22D77ACC',
    });
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'INS-2026-22D77ACC',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({
        code: 'INS-2026-22D77ACC',
        token: 'token-valido',
      }),
    ).resolves.toEqual({
      valid: true,
      code: 'INS-2026-22D77ACC',
    });
  });

  it('rejeita chamada sem código', async () => {
    await expect(
      controller.validateByCode({ code: '   ', token: 'token' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna inválido quando o grant/token é rejeitado', async () => {
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockRejectedValue(new Error('invalid_token'));

    await expect(
      controller.validateByCode({
        code: 'INS-2026-22D77ACC',
        token: 'token-invalido',
      }),
    ).resolves.toEqual({
      valid: false,
      code: 'INS-2026-22D77ACC',
      message: 'Código inválido ou expirado.',
    });
  });
});
