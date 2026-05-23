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
      controller.verify({ code: 'apr-ab12cd34', token: 'aaa.bbb.ccc' }),
    ).resolves.toEqual({
      valid: true,
    });
    expect(publicValidationGrantService.assertActiveToken).toHaveBeenCalledWith(
      'aaa.bbb.ccc',
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
      controller.verify({ code: '***', token: 'aaa.bbb.ccc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita token malformado antes de consultar grant', async () => {
    await expect(
      controller.verify({ code: 'APR-AB12CD34', token: 'token-bruto' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(publicValidationGrantService.assertActiveToken).not.toHaveBeenCalled();
  });
});
