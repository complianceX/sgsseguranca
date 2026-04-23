import { BadRequestException } from '@nestjs/common';
import { PublicDocumentRegistryController } from './public-document-registry.controller';
import type { DocumentRegistryService } from './document-registry.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

describe('PublicDocumentRegistryController', () => {
  let controller: PublicDocumentRegistryController;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode'
  >;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    documentRegistryService = {
      validatePublicCode: jest.fn(),
    };
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicDocumentRegistryController(
      documentRegistryService as DocumentRegistryService,
      publicValidationGrantService as PublicValidationGrantService,
    );
  });

  it('retorna o payload público do documento governado', async () => {
    (documentRegistryService.validatePublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'PT-2026-11-ABCD1234',
      },
    );
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'PT-2026-11-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode({
        code: 'PT-2026-11-ABCD1234',
        token: 'token-valido',
      }),
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

  it('retorna inválido quando o grant/token é rejeitado', async () => {
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockRejectedValue(new Error('invalid_token'));

    await expect(
      controller.validateByCode({
        code: 'PT-2026-11-ABCD1234',
        token: 'token-invalido',
      }),
    ).resolves.toEqual({
      valid: false,
      code: 'PT-2026-11-ABCD1234',
      message: 'Código inválido ou expirado.',
    });
  });
});
