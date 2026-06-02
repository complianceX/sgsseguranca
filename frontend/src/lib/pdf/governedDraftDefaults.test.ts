import { generateAprPdf } from './aprGenerator';
import { generateAuditPdf } from './auditGenerator';
import { generateCatPdf } from './catGenerator';
import { generateChecklistPdf } from './checklistGenerator';
import { generateDossierPdf } from './dossierGenerator';
import { generateNonConformityPdf } from './nonConformityGenerator';

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
  blobToDataUrl: jest.fn(async () => 'data:image/png;base64,AAA'),
}));

jest.mock('@/lib/pdf-system', () => ({
  applyFooterGovernance: jest.fn(),
  applyInstitutionalDocumentHeader: jest.fn(() => 20),
  buildDocumentCode: jest.fn(() => 'DOC-2026-ABC12345'),
  buildPdfFilename: jest.fn(() => 'DOCUMENTO_TESTE.pdf'),
  buildValidationUrl: jest.fn(() => 'https://example.com/validate'),
  createPdfContext: jest.fn(() => ({ y: 0 })),
  drawAprBlueprint: jest.fn(async () => undefined),
  drawAuditBlueprint: jest.fn(async () => undefined),
  drawCatBlueprint: jest.fn(async () => undefined),
  drawChecklistBlueprint: jest.fn(async () => undefined),
  drawDossierBlueprint: jest.fn(async () => undefined),
  drawNcBlueprint: jest.fn(async () => undefined),
  formatDate: jest.fn(() => '05/05/2026'),
  formatDateTime: jest.fn(() => '05/05/2026 10:00'),
  sanitize: jest.fn((value: unknown) => String(value ?? '')),
}));

describe('governed pdf draft defaults', () => {
  beforeEach(() => {
    mockApplyFooterGovernance.mockReset();
  });

  it('gera APR sem watermark de rascunho por default', async () => {
    await generateAprPdf(
      {
        id: 'apr-1',
        numero: 'APR-001',
        titulo: 'APR Teste',
        status: 'Aprovada',
        versao: 1,
        data_inicio: '2026-05-05',
        company_id: 'company-1',
        site_id: 'site-1',
        company: { id: 'company-1', razao_social: 'Empresa Demo', logo_url: null },
        site: { id: 'site-1', nome: 'Obra Central' },
      } as never,
      [],
      { save: false, output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('gera Auditoria sem watermark de rascunho por default', async () => {
    await generateAuditPdf(
      {
        id: 'audit-1',
        titulo: 'Auditoria Interna',
        data_auditoria: '2026-05-05',
        company_id: 'company-1',
        company: { id: 'company-1', razao_social: 'Empresa Demo', logo_url: null },
        site: { id: 'site-1', nome: 'Obra Central' },
      } as never,
      { save: false, output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('gera CAT sem watermark de rascunho por default', async () => {
    await generateCatPdf(
      {
        id: 'abcdef12-3456-7890-abcd-ef1234567890',
        numero: 'CAT-001',
        data_ocorrencia: '2026-05-05T10:00:00.000Z',
        status: 'Emitida',
        company_id: 'company-1',
        company: { id: 'company-1', razao_social: 'Empresa Demo', logo_url: null },
        site: { id: 'site-1', nome: 'Obra Central' },
      } as never,
      { save: false, output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('gera Checklist sem watermark de rascunho por default', async () => {
    await generateChecklistPdf(
      {
        id: 'checklist-1',
        titulo: 'Checklist Diário',
        data: '2026-05-05',
        status: 'Concluído',
        company: { id: 'company-1', razao_social: 'Empresa Demo', logo_url: null },
        site: { id: 'site-1', nome: 'Obra Central' },
      } as never,
      [],
      { output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('gera Dossiê sem watermark de rascunho por default', async () => {
    await generateDossierPdf(
      {
        id: 'dossier-1',
        code: 'DOS-EMP-0001',
        kind: 'employee',
        companyId: 'company-1',
        companyName: 'Empresa Demo',
        generatedAt: '2026-05-05T10:00:00.000Z',
        subject: {
          nome: 'Joao da Silva',
          siteName: 'Obra Central',
          status: true,
        },
      } as never,
      { save: false, output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });

  it('gera NC sem watermark de rascunho por default', async () => {
    await generateNonConformityPdf(
      {
        id: 'nc-1',
        codigo_nc: 'NC-001',
        data_identificacao: '2026-05-05',
        status: 'Aberta',
        company_id: 'company-1',
        local_setor_area: 'Setor A',
        company: { razao_social: 'Empresa Demo', logo_url: null },
        site: { id: 'site-1', nome: 'Obra Central' },
      } as never,
      { save: false, output: 'base64' },
    );

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });
});
