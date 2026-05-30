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
        type: 'hmac',
      },
    });

    await expect(controller.verify({ hash: 'a'.repeat(64) })).resolves.toEqual({
      valid: true,
      message: 'Assinatura validada com sucesso.',
      signature: {
        hash: 'a'.repeat(64),
        type: 'hmac',
      },
    });
  });

  it('retorna o payload público de assinatura não localizada', async () => {
    (signaturesService.verifyByHashPublic as jest.Mock).mockResolvedValue({
      valid: false,
      message: 'Assinatura não localizada.',
    });

    await expect(controller.verify({ hash: 'b'.repeat(64) })).resolves.toEqual({
      valid: false,
      message: 'Assinatura não localizada.',
    });
  });

  it('normaliza hash para minúsculo antes de consultar o serviço', async () => {
    (signaturesService.verifyByHashPublic as jest.Mock).mockResolvedValue({
      valid: false,
      message: 'Assinatura localizada, mas inválida.',
    });

    await controller.verify({ hash: 'A'.repeat(64) });

    expect(signaturesService.verifyByHashPublic).toHaveBeenCalledWith(
      'A'.repeat(64),
    );
  });
});
