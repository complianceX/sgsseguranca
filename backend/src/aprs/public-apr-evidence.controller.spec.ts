import { PublicAprEvidenceController } from './public-apr-evidence.controller';
import type { AprsService } from './aprs.service';

describe('PublicAprEvidenceController', () => {
  let controller: PublicAprEvidenceController;
  let aprsService: Pick<AprsService, 'verifyEvidenceByHashPublic'>;

  beforeEach(() => {
    aprsService = {
      verifyEvidenceByHashPublic: jest.fn(),
    };

    controller = new PublicAprEvidenceController(aprsService as AprsService);
  });

  it('retorna o payload público de sucesso da evidência', async () => {
    (aprsService.verifyEvidenceByHashPublic as jest.Mock).mockResolvedValue({
      verified: true,
      matchedIn: 'original',
      evidence: {
        apr_numero: 'APR-001',
        apr_versao: 2,
      },
    });

    await expect(controller.verify('abc')).resolves.toEqual({
      verified: true,
      matchedIn: 'original',
      evidence: {
        apr_numero: 'APR-001',
        apr_versao: 2,
      },
    });
  });

  it('retorna o payload público de hash não localizado', async () => {
    (aprsService.verifyEvidenceByHashPublic as jest.Mock).mockResolvedValue({
      verified: false,
      message: 'Hash não localizado na base de evidências da APR.',
    });

    await expect(controller.verify('missing')).resolves.toEqual({
      verified: false,
      message: 'Hash não localizado na base de evidências da APR.',
    });
  });
});
