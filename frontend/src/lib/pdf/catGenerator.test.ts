import type { CatRecord } from "@/services/catsService";
import { buildCatDocumentCode, generateCatPdf } from "./catGenerator";

const baseCat: CatRecord = {
  id: "abcdef12-3456-7890-abcd-ef1234567890",
  numero: "CAT-20260319-0001",
  company_id: "company-1",
  company: { id: "company-1", razao_social: "Gandra Tecnologia" },
  site_id: "site-1",
  worker_id: "worker-1",
  data_ocorrencia: "2026-03-19T10:30:00.000Z",
  tipo: "tipico",
  gravidade: "moderada",
  descricao: "Colaborador sofreu torcao leve durante movimentacao de carga.",
  local_ocorrencia: "Galpao principal",
  acao_imediata: "Atendimento imediato e isolamento da area.",
  status: "investigacao",
  opened_at: "2026-03-19T10:35:00.000Z",
  investigated_at: "2026-03-19T11:00:00.000Z",
  created_at: "2026-03-19T10:35:00.000Z",
  updated_at: "2026-03-19T11:10:00.000Z",
  worker: { id: "worker-1", nome: "Maria Souza" },
  site: { id: "site-1", nome: "Obra Central" },
  opened_by: { id: "user-1", nome: "Carlos Silva" },
  attachments: [
    {
      id: "att-1",
      file_name: "foto-1.jpg",
      file_key: "cats/company-1/foto-1.jpg",
      file_type: "image/jpeg",
      category: "investigacao",
      uploaded_at: "2026-03-19T11:05:00.000Z",
    },
  ],
};

describe("catGenerator", () => {
  it("alinha o document code da CAT com o padrao institucional", () => {
    expect(buildCatDocumentCode(baseCat)).toBe("CAT-2026-ABCDEF12");
  });

  it("gera o PDF da CAT sem quebrar e com filename esperado", async () => {
    const result = (await generateCatPdf(baseCat, {
      save: false,
      output: "base64",
    })) as { base64: string; filename: string };

    expect(result.filename).toContain("CAT_CAT-20260319-0001_19-03-2026.pdf");
    expect(result.base64.length).toBeGreaterThan(100);
  });
});
