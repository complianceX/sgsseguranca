import { BadRequestException } from '@nestjs/common';
import { PublicInspectionsController } from './public-inspections.controller';
import type { InspectionsService } from './inspections.service';
import { signValidationToken } from '../common/security/validation-token.util';

describe('PublicInspectionsController', () => {
  let controller: PublicInspectionsController;
  let inspectionsService: Pick<
    InspectionsService,
    'validateByCode' | 'validateByCodeLegacy'
  >;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    inspectionsService = {
      validateByCode: jest.fn(),
      validateByCodeLegacy: jest.fn(),
    };

    controller = new PublicInspectionsController(
      inspectionsService as InspectionsService,
    );
  });

  it('retorna o payload público de inspeção validada', async () => {
    (inspectionsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'INS-2026-22D77ACC',
    });

    const token = signValidationToken({
      code: 'INS-2026-22D77ACC',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({ code: 'INS-2026-22D77ACC', token }),
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

  it('aceita contrato legado quando compatibilidade está habilitada', async () => {
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'true';
    (inspectionsService.validateByCodeLegacy as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'INS-2026-22D77ACC',
    });

    await expect(
      controller.validateByCode({ code: 'INS-2026-22D77ACC' }),
    ).resolves.toEqual({
      valid: true,
      code: 'INS-2026-22D77ACC',
    });
  });
});
