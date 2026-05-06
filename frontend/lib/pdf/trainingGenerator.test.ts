import type { Training } from '@/services/trainingsService';
import type { Signature } from '@/services/signaturesService';
import { generateTrainingPdf } from './trainingGenerator';

const mockApplyFooterGovernance = (
  jest.requireMock('@/lib/pdf-system') as { applyFooterGovernance: jest.Mock }
).applyFooterGovernance;

jest.mock('jspdf', () => ({
  jsPDF: class MockJsPdf {
    save = jest.fn();
  },
}));

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./pdfBase64', () => ({
  pdfDocToBase64: jest.fn(() => 'BASE64_PDF'),
}));

jest.mock('./pdfFile', () => ({
  fetchImageAsDataUrl: jest.fn(async () => null),
}));

jest.mock('@/lib/pdf-system', () => ({
  applyFooterGovernance: jest.fn(),
  applyInstitutionalDocumentHeader: jest.fn(() => 20),
  buildDocumentCode: jest.fn(() => 'TRN-2026-ABC12345'),
  buildPdfFilename: jest.fn(() => 'TREINAMENTO_TESTE.pdf'),
  buildValidationUrl: jest.fn(() => 'https://example.com/validate'),
  createPdfContext: jest.fn(() => ({ y: 0 })),
  drawTrainingBlueprint: jest.fn(async () => undefined),
  formatDate: jest.fn(() => '05/05/2026'),
  formatDateTime: jest.fn(() => '05/05/2026 10:00'),
  sanitize: jest.fn((value: unknown) => String(value ?? '')),
}));

describe('trainingGenerator', () => {
  const trainingBase = {
    id: 'training-1',
    nome: 'NR 35',
    company_id: 'company-1',
    user_id: 'user-1',
    status: 'ativo',
    data_conclusao: '2026-05-05',
    data_vencimento: '2027-05-05',
    created_at: '2026-05-05T10:00:00.000Z',
    updated_at: '2026-05-05T10:00:00.000Z',
    user: {
      id: 'user-1',
      nome: 'Joao da Silva',
    },
    company: {
      id: 'company-1',
      razao_social: 'Empresa Demo',
      logo_url: null,
    },
  } as unknown as Training;

  const signatures: Signature[] = [];

  beforeEach(() => {
    mockApplyFooterGovernance.mockReset();
  });

  it('gera comprovante sem watermark de rascunho por default', async () => {
    await generateTrainingPdf(trainingBase, signatures, {
      save: false,
      output: 'base64',
    });

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('permite solicitar watermark de rascunho explicitamente', async () => {
    await generateTrainingPdf(trainingBase, signatures, {
      save: false,
      output: 'base64',
      draftWatermark: true,
    });

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: true }),
    );
  });
});
