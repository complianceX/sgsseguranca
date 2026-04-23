import { BadRequestException } from '@nestjs/common';
import { PublicChecklistsController } from './public-checklists.controller';
import type { ChecklistsService } from './checklists.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

describe('PublicChecklistsController', () => {
  let controller: PublicChecklistsController;
  let checklistsService: Pick<ChecklistsService, 'validateByCode'>;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    checklistsService = {
      validateByCode: jest.fn(),
    };
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicChecklistsController(
      checklistsService as ChecklistsService,
      publicValidationGrantService as PublicValidationGrantService,
    );
  });

  it('valida com grant/token ativo no novo contrato público', async () => {
    (checklistsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CHK-2026-11-ABCD1234',
    });
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'CHK-2026-11-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({
        code: 'CHK-2026-11-ABCD1234',
        token: 'token-valido',
      }),
    ).resolves.toEqual({
      valid: true,
      code: 'CHK-2026-11-ABCD1234',
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
        code: 'CHK-2026-11-ABCD1234',
        token: 'token-invalido',
      }),
    ).resolves.toEqual({
      valid: false,
      code: 'CHK-2026-11-ABCD1234',
      message: 'Código inválido ou expirado.',
    });
  });
});
