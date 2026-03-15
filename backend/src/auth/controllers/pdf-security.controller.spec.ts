import { PdfSecurityController } from './pdf-security.controller';
import type { PdfService } from '../../common/services/pdf.service';
import type { PdfRateLimitService } from '../services/pdf-rate-limit.service';

describe('PdfSecurityController', () => {
  let controller: PdfSecurityController;
  let pdfService: Pick<PdfService, 'verify'>;
  let pdfRateLimitService: Pick<PdfRateLimitService, 'checkDownloadLimit'>;

  beforeEach(() => {
    pdfService = {
      verify: jest.fn(),
    };
    pdfRateLimitService = {
      checkDownloadLimit: jest.fn(),
    };

    controller = new PdfSecurityController(
      pdfService as PdfService,
      pdfRateLimitService as PdfRateLimitService,
    );
  });

  it('retorna contrato inválido quando hash não existe', async () => {
    (pdfService.verify as jest.Mock).mockResolvedValue({
      hash: 'missing-hash',
      valid: false,
    });

    await expect(controller.verifyPdf('missing-hash')).resolves.toEqual({
      hash: 'missing-hash',
      valid: false,
    });
  });

  it('retorna contrato válido quando hash existe', async () => {
    (pdfService.verify as jest.Mock).mockResolvedValue({
      hash: 'known-hash',
      valid: true,
      originalName: 'relatorio.pdf',
      signedAt: '2026-03-14T18:00:00.000Z',
    });

    await expect(controller.verifyPdf('known-hash')).resolves.toEqual({
      hash: 'known-hash',
      valid: true,
      originalName: 'relatorio.pdf',
      signedAt: '2026-03-14T18:00:00.000Z',
    });
  });
});
