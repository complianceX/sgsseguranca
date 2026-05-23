import { BadRequestException } from '@nestjs/common';
import { PublicSignaturesController } from './public-signatures.controller';
import type { SignaturesService } from './signatures.service';

describe('PublicSignaturesController', () => {
  let controller: PublicSignaturesController;
  let signaturesService: Pick<SignaturesService, 'verifyByHashPublic'>;

  beforeEach(() => {
    signaturesService = {
      verifyByHashPublic: jest.fn(),
    };

    controller = new PublicSignaturesController(
      signaturesService as SignaturesService,
    );
  });

  it('retorna o payload público de assinatura válida', async () => {
    (signaturesService.verifyByHashPublic as jest.Mock).mockResolvedValue({
      valid: true,
      message: 'Assinatura validada com sucesso.',
      signature: {
        hash: 'a'.repeat(64),
        document_id: 'dds-1',
        document_type: 'DDS',
        type: 'hmac',
      },
    });

    await expect(controller.verify('a'.repeat(64))).resolves.toEqual({
      valid: true,
      message: 'Assinatura validada com sucesso.',
      signature: {
        hash: 'a'.repeat(64),
        document_id: 'dds-1',
        document_type: 'DDS',
        type: 'hmac',
      },
    });
  });

  it('retorna o payload público de assinatura não localizada', async () => {
    (signaturesService.verifyByHashPublic as jest.Mock).mockResolvedValue({
      valid: false,
      message: 'Assinatura não localizada.',
    });

    await expect(controller.verify('b'.repeat(64))).resolves.toEqual({
      valid: false,
      message: 'Assinatura não localizada.',
    });
  });

  it('bloqueia hash inválido antes de consultar o serviço', () => {
    expect(() => controller.verify('abc')).toThrow(BadRequestException);
    expect(signaturesService.verifyByHashPublic).not.toHaveBeenCalled();
  });
});
