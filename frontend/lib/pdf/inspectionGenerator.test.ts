import type { Inspection } from "@/services/inspectionsService";
import api from "@/lib/api";
import { generateInspectionPdf } from "./inspectionGenerator";

const mockApiGet = api.get as jest.Mock;
const mockFetch = jest.fn();
const mockApplyFooterGovernance = (
  jest.requireMock("@/lib/pdf-system") as { applyFooterGovernance: jest.Mock }
).applyFooterGovernance;

let capturedEvidenceLoaderResult: string | null = null;

jest.mock("jspdf", () => ({
  jsPDF: class MockJsPdf {
    save = jest.fn();
  },
}));

jest.mock("jspdf-autotable", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("./pdfBase64", () => ({
  pdfDocToBase64: jest.fn(() => "BASE64_PDF"),
}));

jest.mock("@/lib/pdf-system", () => ({
  applyFooterGovernance: jest.fn(),
  applyInstitutionalDocumentHeader: jest.fn(() => 20),
  buildDocumentCode: jest.fn(() => "INS-2026-ABC12345"),
  buildPdfFilename: jest.fn(() => "INSPECAO_TESTE.pdf"),
  buildValidationUrl: jest.fn(() => "https://example.com/validate"),
  createPdfContext: jest.fn(() => ({ y: 0 })),
  drawPhotographicReportBlueprint: jest.fn(
    async (
      _ctx: unknown,
      _autoTable: unknown,
      _inspection: unknown,
      _code: string,
      _validationUrl: string,
      evidenceLoader: (item: { source?: string }, index: number) => Promise<string | null>,
    ) => {
      capturedEvidenceLoaderResult = await evidenceLoader(
        { source: "https://bucket.r2.cloudflarestorage.com/documents/company-1/inspections/insp-1/photo.jpg" },
        0,
      );
    },
  ),
  formatDateTime: jest.fn(() => "2026-04-01 10:00"),
  sanitize: jest.fn((value: unknown) => String(value ?? "")),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("inspectionGenerator", () => {
  const inspectionBase: Inspection = {
    id: "insp-1",
    company_id: "company-1",
    site_id: "site-1",
    setor_area: "Setor A",
    tipo_inspecao: "Rotina",
    data_inspecao: "2026-04-01",
    horario: "08:00",
    responsavel_id: "user-1",
    evidencias: [{ descricao: "Foto 1", url: "legacy-url" }],
    created_at: "2026-04-01T10:00:00.000Z",
    updated_at: "2026-04-01T10:00:00.000Z",
  };

  beforeEach(() => {
    capturedEvidenceLoaderResult = null;
    mockApiGet.mockReset();
    mockFetch.mockReset();
    mockApplyFooterGovernance.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("na inspeção persistida usa apenas API de evidência e não faz fetch direto no R2 quando API falha", async () => {
    mockApiGet.mockRejectedValue(new Error("not found"));

    await generateInspectionPdf(inspectionBase, {
      save: false,
      output: "base64",
    });

    expect(mockApiGet).toHaveBeenCalledWith(
      "/inspections/insp-1/evidences/0/file",
      { responseType: "arraybuffer" },
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(capturedEvidenceLoaderResult).toBeNull();
  });

  it("mantém fallback remoto quando a inspeção não está persistida", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
    });

    await generateInspectionPdf(
      {
        ...inspectionBase,
        id: "",
      },
      {
        save: false,
        output: "base64",
      },
    );

    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedEvidenceLoaderResult).toBeNull();
  });

  it("permite gerar PDF sem marca d'água de rascunho para emissão governada", async () => {
    mockApiGet.mockRejectedValue(new Error("not found"));

    await generateInspectionPdf(inspectionBase, {
      save: false,
      output: "base64",
      draftWatermark: false,
    });

    expect(mockApplyFooterGovernance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draft: false }),
    );
  });
});
