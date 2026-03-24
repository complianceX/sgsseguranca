import api from "@/lib/api";
import { aprsService } from "@/services/aprsService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe("aprsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga erro quando o backend falha ao listar evidencias da APR", async () => {
    const routeError = {
      response: { status: 404 },
    };
    (api.get as jest.Mock).mockRejectedValue(routeError);

    await expect(aprsService.listAprEvidences("apr-1")).rejects.toBe(
      routeError,
    );
  });

  it("envia a planilha APR em multipart para obter preview da importacao", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        fileName: "apr.xlsx",
        sheetName: "APR",
        importedRows: 1,
        ignoredRows: 0,
        warnings: [],
        errors: [],
        matchedColumns: {
          atividade_processo: "Atividade/Processo",
        },
        draft: {
          numero: "APR-001",
          risk_items: [],
        },
      },
    });

    const file = new File(["conteudo"], "apr.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await aprsService.previewExcelImport(file);

    expect(api.post).toHaveBeenCalledWith(
      "/aprs/import/excel/preview",
      expect.any(FormData),
    );
    expect(result.fileName).toBe("apr.xlsx");
  });

  it("remove company_id e status do payload ao criar APR", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-1",
        numero: "APR-001",
        titulo: "APR Torre",
      },
    });

    await aprsService.create({
      numero: "APR-001",
      titulo: "APR Torre",
      data_inicio: "2026-03-23",
      data_fim: "2026-03-24",
      company_id: "company-1",
      site_id: "site-1",
      elaborador_id: "user-1",
      status: "Aprovada",
      participants: ["user-1", "user-1"],
    });

    expect(api.post).toHaveBeenCalledWith("/aprs", {
      numero: "APR-001",
      titulo: "APR Torre",
      data_inicio: "2026-03-23",
      data_fim: "2026-03-24",
      site_id: "site-1",
      elaborador_id: "user-1",
      participants: ["user-1"],
    });
  });

  it("remove company_id e status do payload ao atualizar APR", async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-1",
        titulo: "APR revisada",
      },
    });

    await aprsService.update("apr-1", {
      titulo: "APR revisada",
      company_id: "company-1",
      status: "Encerrada",
      participants: ["user-1", "user-1", "user-2"],
    });

    expect(api.patch).toHaveBeenCalledWith("/aprs/apr-1", {
      titulo: "APR revisada",
      participants: ["user-1", "user-2"],
    });
  });

  it("solicita ao backend a geração do PDF final governado", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        entityId: "apr-1",
        generated: true,
        hasFinalPdf: true,
      },
    });

    const result = await aprsService.generateFinalPdf("apr-1");

    expect(api.post).toHaveBeenCalledWith(
      "/aprs/apr-1/generate-final-pdf",
      undefined,
      { timeout: undefined },
    );
    expect(result.generated).toBe(true);
    expect(result.hasFinalPdf).toBe(true);
  });
});
