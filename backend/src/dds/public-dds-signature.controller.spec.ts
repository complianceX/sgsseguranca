import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { PublicDdsSignatureController } from './public-dds-signature.controller';
import type {
  DdsSignatureInviteService,
  PublicDdsSignatureContext,
  PublicDdsSignatureSubmitResult,
} from './dds-signature-invite.service';

describe('PublicDdsSignatureController', () => {
  let controller: PublicDdsSignatureController;
  let signatureInviteService: Pick<
    DdsSignatureInviteService,
    'getPublicContext' | 'submitPublicSignature'
  >;

  beforeEach(() => {
    signatureInviteService = {
      getPublicContext: jest.fn(),
      submitPublicSignature: jest.fn(),
    };

    controller = new PublicDdsSignatureController(
      signatureInviteService as DdsSignatureInviteService,
    );
  });

  it('retorna contexto público quando token é válido', async () => {
    (signatureInviteService.getPublicContext as jest.Mock).mockResolvedValue({
      inviteId: 'invite-1',
    } as PublicDdsSignatureContext);

    await expect(controller.getContext('aaa.bbb.ccc')).resolves.toEqual({
      inviteId: 'invite-1',
    });
    expect(signatureInviteService.getPublicContext).toHaveBeenCalledWith(
      'aaa.bbb.ccc',
    );
  });

  it('submete assinatura pública com token válido', async () => {
    (signatureInviteService.submitPublicSignature as jest.Mock).mockResolvedValue(
      {
        signed: true,
        signatureId: 'sig-1',
        signatureHash: 'a'.repeat(64),
        signedAt: new Date().toISOString(),
      } as PublicDdsSignatureSubmitResult,
    );
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get: jest.fn(() => 'test-agent'),
    } as unknown as Request;

    await expect(
      controller.submitSignature(
        'aaa.bbb.ccc',
        {
          accepted_terms: true,
          signature_data: 'data:image/png;base64,abc',
        },
        req,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        signed: true,
        signatureId: 'sig-1',
      }),
    );
  });

  it('bloqueia token inválido antes de chamar o serviço', async () => {
    expect(() => controller.getContext('token-invalido')).toThrow(
      BadRequestException,
    );

    expect(signatureInviteService.getPublicContext).not.toHaveBeenCalled();
  });
});
