import { BadRequestException } from '@nestjs/common';
import { PublicChecklistsController } from './public-checklists.controller';
import type { ChecklistsService } from './checklists.service';
import { signValidationToken } from '../common/security/validation-token.util';

describe('PublicChecklistsController', () => {
  let controller: PublicChecklistsController;
  let checklistsService: Pick<
    ChecklistsService,
    'validateByCode' | 'validateByCodeLegacy'
  >;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    checklistsService = {
      validateByCode: jest.fn(),
      validateByCodeLegacy: jest.fn(),
    };

    controller = new PublicChecklistsController(
      checklistsService as ChecklistsService,
    );
  });

  it('valida com token no novo contrato público', async () => {
    (checklistsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CHK-2026-11-ABCD1234',
    });

    const token = signValidationToken({
      code: 'CHK-2026-11-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({ code: 'CHK-2026-11-ABCD1234', token }),
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

  it('mantém compatibilidade legada quando PUBLIC_VALIDATION_LEGACY_COMPAT=true', async () => {
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'true';
    (checklistsService.validateByCodeLegacy as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CHK-2026-11-ABCD1234',
    });

    await expect(
      controller.validateByCode({ code: 'CHK-2026-11-ABCD1234' }),
    ).resolves.toEqual({
      valid: true,
      code: 'CHK-2026-11-ABCD1234',
    });
  });
});
