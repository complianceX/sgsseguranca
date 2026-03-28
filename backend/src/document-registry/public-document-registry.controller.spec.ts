import { BadRequestException } from '@nestjs/common';
import { PublicDocumentRegistryController } from './public-document-registry.controller';
import type { DocumentRegistryService } from './document-registry.service';
import { signValidationToken } from '../common/security/validation-token.util';

describe('PublicDocumentRegistryController', () => {
  let controller: PublicDocumentRegistryController;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode' | 'validateLegacyPublicCode'
  >;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    documentRegistryService = {
      validatePublicCode: jest.fn(),
      validateLegacyPublicCode: jest.fn(),
    };

    controller = new PublicDocumentRegistryController(
      documentRegistryService as DocumentRegistryService,
    );
  });

  it('retorna o payload público do documento governado', async () => {
    (documentRegistryService.validatePublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'PT-2026-11-ABCD1234',
      },
    );

    const token = signValidationToken({
      code: 'PT-2026-11-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({ code: 'PT-2026-11-ABCD1234', token }),
    ).resolves.toEqual({
      valid: true,
      code: 'PT-2026-11-ABCD1234',
    });
  });

  it('rejeita chamada sem código', async () => {
    await expect(
      controller.validateByCode({ code: '   ', token: 'token' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mantém compatibilidade legada quando PUBLIC_VALIDATION_LEGACY_COMPAT=true', async () => {
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'true';
    (documentRegistryService.validateLegacyPublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'PT-2026-11-ABCD1234',
      },
    );

    await expect(
      controller.validateByCode({ code: 'PT-2026-11-ABCD1234' }),
    ).resolves.toEqual({
      valid: true,
      code: 'PT-2026-11-ABCD1234',
    });
  });
});
