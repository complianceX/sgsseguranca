import { PdfSecurityController } from './pdf-security.controller';
import type { PdfService } from '../../common/services/pdf.service';
import type { PdfRateLimitService } from '../services/pdf-rate-limit.service';

describe('PdfSecurityController', () => {
  let controller: PdfSecurityController;
  let pdfService: Pick<PdfService, 'verify' | 'verifyForCompany'>;
  let pdfRateLimitService: Pick<PdfRateLimitService, 'checkDownloadLimit'>;

  beforeEach(() => {
    pdfService = {
      verify: jest.fn(),
      verifyForCompany: jest.fn(),
    };
    pdfRateLimitService = {
      checkDownloadLimit: jest.fn(),
    };

    controller = new PdfSecurityController(
      pdfService as PdfService,
      pdfRateLimitService as PdfRateLimitService,
      { inspect: jest.fn() } as never,
    );
  });

  it('retorna contrato inválido quando hash não existe', async () => {
    (pdfService.verifyForCompany as jest.Mock).mockResolvedValue({
      hash: 'missing-hash',
      valid: false,
    });

    await expect(
      controller.verifyPdf('missing-hash', {
        user: { companyId: 'company-1' },
      } as never),
    ).resolves.toEqual({
      hash: 'missing-hash',
      valid: false,
    });
  });

  it('retorna contrato válido quando hash existe', async () => {
    (pdfService.verifyForCompany as jest.Mock).mockResolvedValue({
      hash: 'known-hash',
      valid: true,
      originalName: 'relatorio.pdf',
      signedAt: '2026-03-14T18:00:00.000Z',
    });

    await expect(
      controller.verifyPdf('known-hash', {
        user: { company_id: 'company-1' },
      } as never),
    ).resolves.toEqual({
      hash: 'known-hash',
      valid: true,
      originalName: 'relatorio.pdf',
      signedAt: '2026-03-14T18:00:00.000Z',
    });
  });

  it('rejeita verificação sem contexto de empresa', async () => {
    await expect(
      controller.verifyPdf('known-hash', { user: {} } as never),
    ).rejects.toThrow('Contexto de empresa obrigatório');
  });
});
