import { BadRequestException } from '@nestjs/common';
import { PublicDocumentRegistryController } from './public-document-registry.controller';
import type { DocumentRegistryService } from './document-registry.service';

describe('PublicDocumentRegistryController', () => {
  let controller: PublicDocumentRegistryController;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode'
  >;

  beforeEach(() => {
    documentRegistryService = {
      validatePublicCode: jest.fn(),
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
        document: {
          id: 'pt-1',
          module: 'pt',
        },
      },
    );

    await expect(
      controller.validateByCode('PT-2026-11-ABCD1234'),
    ).resolves.toEqual({
      valid: true,
      code: 'PT-2026-11-ABCD1234',
      document: {
        id: 'pt-1',
        module: 'pt',
      },
    });
  });

  it('rejeita chamada sem código', async () => {
    await expect(controller.validateByCode('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
