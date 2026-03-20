import api from "@/lib/api";
import { aprsService } from "@/services/aprsService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
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
      expect.objectContaining({
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    expect(result.fileName).toBe("apr.xlsx");
  });
});
