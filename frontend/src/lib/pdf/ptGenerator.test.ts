import type { Pt } from "@/services/ptsService";
import type { Signature } from "@/services/signaturesService";

const getValidationContext = jest.fn();
const getEvidencePhotoAccess = jest.fn();

jest.mock("@/services/ptsService", () => ({
  ptsService: {
    getValidationContext: (...args: unknown[]) => getValidationContext(...args),
    getEvidencePhotoAccess: (...args: unknown[]) =>
      getEvidencePhotoAccess(...args),
  },
}));

import { generatePtPdf } from "./ptGenerator";

const basePt: Pt = {
  id: "pt-1",
  numero: "PT-2026-07-10-ECQ-001",
  titulo: "Entrada em espaco confinado",
  data_hora_inicio: "2026-07-10T08:00:00.000Z",
  data_hora_fim: "2026-07-10T17:00:00.000Z",
  status: "Aprovada",
  company_id: "company-1",
  site_id: "site-1",
  responsavel_id: "user-1",
  executantes: [],
  trabalho_altura: false,
  espaco_confinado: false,
  trabalho_quente: false,
  eletricidade: false,
  escavacao: false,
  created_at: "2026-07-10T07:00:00.000Z",
  updated_at: "2026-07-10T07:30:00.000Z",
  site: { nome: "Obra Central" },
};

const signatures: Signature[] = [];

describe("ptGenerator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getValidationContext.mockResolvedValue({
      documentCode: "PT-2026-07-10-ECQ-001",
      finalPdfHash: "abc123hashdeadbeef",
      token: "pt-token",
    });
    getEvidencePhotoAccess.mockResolvedValue({ url: null });
  });

  it("gera o PDF da PT sem quebrar e devolve base64 + filename", async () => {
    const result = (await generatePtPdf(basePt, signatures, {
      save: false,
      output: "base64",
    })) as { base64: string; filename: string };

    expect(result.base64.length).toBeGreaterThan(100);
    // O filename deve refletir o número da PT (não um hash gerado).
    expect(result.filename).toContain("PT");
    expect(result.filename.endsWith(".pdf")).toBe(true);
  });

  it("busca o contexto de validação governado quando há id", async () => {
    await generatePtPdf(basePt, signatures, {
      save: false,
      output: "base64",
    });

    expect(getValidationContext).toHaveBeenCalledWith("pt-1");
  });

  it("degrada graciosamente quando o contexto de validação falha", async () => {
    getValidationContext.mockRejectedValueOnce(new Error("offline"));

    const result = (await generatePtPdf(basePt, signatures, {
      save: false,
      output: "base64",
    })) as { base64: string; filename: string };

    // Mesmo sem token/hash, o PDF ainda é gerado.
    expect(result.base64.length).toBeGreaterThan(100);
  });

  it("usa o hash local da PT quando o contexto não retorna hash", async () => {
    getValidationContext.mockResolvedValue({
      documentCode: "PT-2026-07-10-ECQ-001",
      finalPdfHash: null,
      token: "pt-token",
    });

    const result = (await generatePtPdf(
      { ...basePt, final_pdf_hash_sha256: "localhash1234567890" },
      signatures,
      { save: false, output: "base64" },
    )) as { base64: string; filename: string };

    expect(result.base64.length).toBeGreaterThan(100);
  });

  it("não consulta o contexto de validação em modo rascunho", async () => {
    // Rascunho (draftWatermark) não deve carregar token/QR de validação oficial.
    const result = (await generatePtPdf(basePt, signatures, {
      save: false,
      output: "base64",
      draftWatermark: true,
    })) as { base64: string; filename: string };

    expect(result.base64.length).toBeGreaterThan(100);
    expect(getValidationContext).not.toHaveBeenCalled();
  });
});
