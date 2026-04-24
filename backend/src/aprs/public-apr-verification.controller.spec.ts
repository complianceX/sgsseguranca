import { BadRequestException } from '@nestjs/common';
import { PublicAprVerificationController } from './public-apr-verification.controller';

describe('PublicAprVerificationController', () => {
  const aprsService = {
    verifyFinalPdfPublic: jest.fn(),
  };
  const publicValidationGrantService = {
    assertActiveToken: jest.fn(),
  };

  let controller: PublicAprVerificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PublicAprVerificationController(
      aprsService as never,
      publicValidationGrantService as never,
    );
  });

  it('encaminha o código normalizado para o service público', async () => {
    publicValidationGrantService.assertActiveToken.mockResolvedValue({
      companyId: 'company-1',
    });
    aprsService.verifyFinalPdfPublic.mockResolvedValue({
      valid: true,
    });

    await expect(
      controller.verify({ code: 'apr-ab12cd34', token: 'token-1' }),
    ).resolves.toEqual({
      valid: true,
    });
    expect(publicValidationGrantService.assertActiveToken).toHaveBeenCalledWith(
      'token-1',
      'APR-AB12CD34',
      'apr_public_validation',
    );
    expect(aprsService.verifyFinalPdfPublic).toHaveBeenCalledWith(
      'APR-AB12CD34',
      'company-1',
    );
  });

  it('rejeita código inválido', async () => {
    await expect(
      controller.verify({ code: '***', token: 'token-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
