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
    });

    await expect(controller.verify('abc')).resolves.toEqual({
      valid: true,
      message: 'Assinatura validada com sucesso.',
    });
  });

  it('retorna o payload público de assinatura não localizada', async () => {
    (signaturesService.verifyByHashPublic as jest.Mock).mockResolvedValue({
      valid: false,
      message: 'Assinatura não localizada.',
    });

    await expect(controller.verify('missing')).resolves.toEqual({
      valid: false,
      message: 'Assinatura não localizada.',
    });
  });
});
