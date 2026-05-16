jest.mock("./pdfFile", () => ({
  fetchImageAsDataUrl: jest.fn(async () => null),
}));

jest.mock("@/lib/pdf-system", () => ({
  applyFooterGovernance: jest.fn(),
  applyInstitutionalDocumentHeader: jest.fn(() => 24),
  buildDocumentCode: jest.fn(() => "CHK-2026-TESTE0001"),
  buildPdfFilename: jest.fn(() => "CHECKLIST_TESTE.pdf"),
  buildValidationUrl: jest.fn(
    () => "https://example.com/validate/CHK-2026-TESTE0001",
  ),
  createPdfContext: jest.fn((doc: unknown) => ({ doc, y: 0 })),
  drawChecklistBlueprint: jest.fn(async () => undefined),
  formatDateTime: jest.fn(() => "15/05/2026 11:30"),
  sanitize: jest.fn((value: unknown) => String(value ?? "")),
}));

import * as pdfSystem from "@/lib/pdf-system";
import { generateChecklistPdf } from "./checklistGenerator";

const mockApplyFooterGovernance = jest.mocked(pdfSystem.applyFooterGovernance);
const mockApplyInstitutionalDocumentHeader = jest.mocked(
  pdfSystem.applyInstitutionalDocumentHeader,
);
const mockDrawChecklistBlueprint = jest.mocked(
  pdfSystem.drawChecklistBlueprint,
);

describe("generateChecklistPdf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emite um PDF final real em base64 para o checklist governado", async () => {
    const result = await generateChecklistPdf(
      {
        id: "checklist-1",
        titulo: "Checklist PEMT Final",
        data: "2026-05-15",
        status: "Conforme",
        company_id: "company-1",
        site_id: "site-1",
        inspetor_id: "user-1",
        itens: [
          {
            item: "Os cabos foram verificados e estao em perfeito estado?",
            status: "sim",
          },
        ],
        company: {
          razao_social: "Empresa Demo",
          logo_url: null,
        },
        site: {
          nome: "Obra Central",
        },
        created_at: "2026-05-15T11:00:00.000Z",
        updated_at: "2026-05-15T11:00:00.000Z",
      },
      [],
      {
        output: "base64",
        draftWatermark: false,
      },
    );

    expect(result).toBeDefined();
    expect(result?.filename).toBe("CHECKLIST_TESTE.pdf");
    expect(result?.base64).toBeTruthy();

    const pdfHeader = Buffer.from(result?.base64 || "", "base64")
      .subarray(0, 5)
      .toString("latin1");

    expect(pdfHeader).toBe("%PDF-");
    expect(mockApplyInstitutionalDocumentHeader).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "CHECKLIST DE INSPECAO",
        code: "CHK-2026-TESTE0001",
        status: "Conforme",
      }),
    );
    expect(mockDrawChecklistBlueprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      expect.objectContaining({
        id: "checklist-1",
        titulo: "Checklist PEMT Final",
      }),
      [],
      "CHK-2026-TESTE0001",
      "https://example.com/validate/CHK-2026-TESTE0001",
    );
    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: "CHK-2026-TESTE0001",
        draft: false,
      }),
    );
  });
});
