import { BadRequestException } from '@nestjs/common';
import { PublicAprVerificationController } from './public-apr-verification.controller';

describe('PublicAprVerificationController', () => {
  const aprsService = {
    verifyFinalPdfPublic: jest.fn(),
  };

  let controller: PublicAprVerificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PublicAprVerificationController(aprsService as never);
  });

  it('encaminha o código normalizado para o service público', async () => {
    aprsService.verifyFinalPdfPublic.mockResolvedValue({
      valid: true,
    });

    await expect(controller.verify('apr-ab12cd34')).resolves.toEqual({
      valid: true,
    });
    expect(aprsService.verifyFinalPdfPublic).toHaveBeenCalledWith(
      'APR-AB12CD34',
    );
  });

  it('rejeita código inválido', () => {
    expect(() => controller.verify('***')).toThrow(BadRequestException);
  });
});
