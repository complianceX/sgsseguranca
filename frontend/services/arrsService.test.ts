import api from "@/lib/api";
import {
  arrsService,
  ARR_STATUS_LABEL,
  ARR_STATUS_COLORS,
  ARR_ALLOWED_TRANSITIONS,
  ARR_RISK_LEVEL_LABEL,
  ARR_PROBABILITY_LABEL,
  ARR_SEVERITY_LABEL,
  type ArrMutationInput,
} from "@/services/arrsService";
import {
  consumeOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
} from "@/lib/offline-cache";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/lib/offline-cache", () => ({
  consumeOfflineCache: jest.fn(),
  isOfflineRequestError: jest.fn(),
  setOfflineCache: jest.fn(),
  CACHE_TTL: { LIST: 60000, RECORD: 300000 },
}));

const basePayload: ArrMutationInput = {
  titulo: "ARR Trabalho em Altura",
  data: "2026-04-15",
  atividade_principal: "Manutenção em telhado",
  condicao_observada: "Sem proteção coletiva",
  risco_identificado: "Queda de altura",
  nivel_risco: "alto",
  probabilidade: "alta",
  severidade: "grave",
  controles_imediatos: "Uso de cinto de segurança",
  site_id: "site-1",
  responsavel_id: "user-1",
  participants: ["user-1", "user-2"],
};

describe("arrsService — mapas de constantes", () => {
  it("ARR_STATUS_LABEL contém os quatro status esperados", () => {
    expect(ARR_STATUS_LABEL.rascunho).toBe("Rascunho");
    expect(ARR_STATUS_LABEL.analisada).toBe("Analisada");
    expect(ARR_STATUS_LABEL.tratada).toBe("Tratada");
    expect(ARR_STATUS_LABEL.arquivada).toBe("Arquivada");
  });

  it("ARR_STATUS_COLORS possui uma string de classe para cada status", () => {
    const statuses = ["rascunho", "analisada", "tratada", "arquivada"] as const;
    for (const s of statuses) {
      expect(typeof ARR_STATUS_COLORS[s]).toBe("string");
      expect(ARR_STATUS_COLORS[s].length).toBeGreaterThan(0);
    }
  });

  it("ARR_ALLOWED_TRANSITIONS define a máquina de estados corretamente", () => {
    expect(ARR_ALLOWED_TRANSITIONS.rascunho).toEqual(
      expect.arrayContaining(["analisada", "arquivada"]),
    );
    expect(ARR_ALLOWED_TRANSITIONS.analisada).toEqual(
      expect.arrayContaining(["tratada", "arquivada"]),
    );
    expect(ARR_ALLOWED_TRANSITIONS.tratada).toEqual(["arquivada"]);
    expect(ARR_ALLOWED_TRANSITIONS.arquivada).toEqual([]);
  });

  it("ARR_RISK_LEVEL_LABEL cobre os quatro níveis de risco", () => {
    expect(ARR_RISK_LEVEL_LABEL.baixo).toBe("Baixo");
    expect(ARR_RISK_LEVEL_LABEL.medio).toBe("Médio");
    expect(ARR_RISK_LEVEL_LABEL.alto).toBe("Alto");
    expect(ARR_RISK_LEVEL_LABEL.critico).toBe("Crítico");
  });

  it("ARR_PROBABILITY_LABEL cobre as três probabilidades", () => {
    expect(ARR_PROBABILITY_LABEL.baixa).toBe("Baixa");
    expect(ARR_PROBABILITY_LABEL.media).toBe("Média");
    expect(ARR_PROBABILITY_LABEL.alta).toBe("Alta");
  });

  it("ARR_SEVERITY_LABEL cobre as quatro severidades", () => {
    expect(ARR_SEVERITY_LABEL.leve).toBe("Leve");
    expect(ARR_SEVERITY_LABEL.moderada).toBe("Moderada");
    expect(ARR_SEVERITY_LABEL.grave).toBe("Grave");
    expect(ARR_SEVERITY_LABEL.critica).toBe("Crítica");
  });
});

describe("arrsService — operações CRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isOfflineRequestError as jest.Mock).mockReturnValue(false);
  });

  it("findPaginated envia parâmetros padrão quando nenhuma opção é fornecida", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 1, limit: 20, total: 0, lastPage: 1 },
    });

    await arrsService.findPaginated();

    expect(api.get).toHaveBeenCalledWith("/arrs", {
      params: { page: 1, limit: 20 },
    });
  });

  it("findPaginated envia todos os filtros opcionais ao backend", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 2, limit: 10, total: 0, lastPage: 1 },
    });

    await arrsService.findPaginated({
      page: 2,
      limit: 10,
      search: "telhado",
      status: "analisada",
    });

    expect(api.get).toHaveBeenCalledWith("/arrs", {
      params: { page: 2, limit: 10, search: "telhado", status: "analisada" },
    });
  });

  it("findPaginated retorna o objeto paginado do backend", async () => {
    const mockData = {
      data: [{ id: "arr-1", titulo: "ARR Paginada" }],
      page: 1,
      limit: 20,
      total: 1,
      lastPage: 1,
    };
    (api.get as jest.Mock).mockResolvedValue({ data: mockData });

    const result = await arrsService.findPaginated();

    expect(result).toEqual(mockData);
  });

  it("findPaginated persiste cache da listagem", async () => {
    const mockData = {
      data: [{ id: "arr-1", titulo: "ARR cacheada" }],
      page: 1,
      limit: 20,
      total: 1,
      lastPage: 1,
    };
    (api.get as jest.Mock).mockResolvedValue({ data: mockData });

    await arrsService.findPaginated({ page: 1, limit: 20, status: "analisada" });

    expect(setOfflineCache).toHaveBeenCalled();
  });

  it("findPaginated retorna cache offline quando a rede falha", async () => {
    const cached = {
      data: [{ id: "arr-1" }],
      page: 1,
      limit: 20,
      total: 1,
      lastPage: 1,
    };
    (api.get as jest.Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(cached);

    const result = await arrsService.findPaginated();

    expect(result).toBe(cached);
  });

  it("findOne chama a rota correta e retorna a ARR", async () => {
    const mockArr = { id: "arr-1", titulo: "ARR Unitária", status: "rascunho" };
    (api.get as jest.Mock).mockResolvedValue({ data: mockArr });

    const result = await arrsService.findOne("arr-1");

    expect(api.get).toHaveBeenCalledWith("/arrs/arr-1");
    expect(result).toEqual(mockArr);
  });

  it("findOne persiste cache do registro", async () => {
    const mockArr = { id: "arr-1", titulo: "ARR Unitária", status: "rascunho" };
    (api.get as jest.Mock).mockResolvedValue({ data: mockArr });

    await arrsService.findOne("arr-1");

    expect(setOfflineCache).toHaveBeenCalled();
  });

  it("create normaliza payload antes de enviar ao backend", async () => {
    const mockArr = { id: "arr-novo", ...basePayload, status: "rascunho" };
    (api.post as jest.Mock).mockResolvedValue({ data: mockArr });

    const result = await arrsService.create({
      ...basePayload,
      descricao: "   ",
      turno: "",
      frente_trabalho: " Frente A ",
      atividade_principal: " Montagem em altura ",
      condicao_observada: "  Sem linha de vida na área ",
      risco_identificado: " Queda de trabalhador ",
      controles_imediatos: " Isolar e corrigir acesso ",
      acao_recomendada: " ",
      epi_epc_aplicaveis: "",
      observacoes: " Observação final ",
      participants: ["user-1", "user-1", "user-2", ""],
    });

    expect(api.post).toHaveBeenCalledWith("/arrs", {
      ...basePayload,
      descricao: undefined,
      turno: undefined,
      frente_trabalho: "Frente A",
      atividade_principal: "Montagem em altura",
      condicao_observada: "Sem linha de vida na área",
      risco_identificado: "Queda de trabalhador",
      controles_imediatos: "Isolar e corrigir acesso",
      acao_recomendada: undefined,
      epi_epc_aplicaveis: undefined,
      observacoes: "Observação final",
      participants: ["user-1", "user-2"],
    });
    expect(result.id).toBe("arr-novo");
  });

  it("update chama PATCH na rota correta com payload saneado", async () => {
    const mockUpdated = { id: "arr-1", titulo: "ARR Atualizada", status: "analisada" };
    (api.patch as jest.Mock).mockResolvedValue({ data: mockUpdated });

    const result = await arrsService.update("arr-1", {
      titulo: " ARR Atualizada ",
      observacoes: " ",
      participants: ["user-1", "user-1"],
    });

    expect(api.patch).toHaveBeenCalledWith("/arrs/arr-1", {
      titulo: "ARR Atualizada",
      observacoes: undefined,
      participants: ["user-1"],
    });
    expect(result.titulo).toBe("ARR Atualizada");
  });

  it("delete chama a rota correta e resolve sem valor", async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    await arrsService.delete("arr-1");

    expect(api.delete).toHaveBeenCalledWith("/arrs/arr-1");
  });
});

describe("arrsService — updateStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updateStatus envia PATCH com o novo status para a rota /status", async () => {
    const mockArr = { id: "arr-1", status: "analisada" };
    (api.patch as jest.Mock).mockResolvedValue({ data: mockArr });

    const result = await arrsService.updateStatus("arr-1", "analisada");

    expect(api.patch).toHaveBeenCalledWith("/arrs/arr-1/status", {
      status: "analisada",
    });
    expect(result.status).toBe("analisada");
  });

  it("updateStatus propaga erro quando o backend rejeita a transição", async () => {
    (api.patch as jest.Mock).mockRejectedValue({
      response: { status: 422, data: { message: "Transição inválida" } },
    });

    await expect(
      arrsService.updateStatus("arr-1", "tratada"),
    ).rejects.toMatchObject({ response: { status: 422 } });
  });
});

describe("arrsService — attachFile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("attachFile envia o arquivo em multipart/form-data", async () => {
    const mockResult = {
      fileKey: "arrs/arr-1/doc.pdf",
      folderPath: "arrs/arr-1",
      originalName: "doc.pdf",
      storageMode: "s3",
      degraded: false,
      message: "Arquivo anexado com sucesso",
    };
    (api.post as jest.Mock).mockResolvedValue({ data: mockResult });

    const file = new File(["conteudo"], "doc.pdf", { type: "application/pdf" });
    const result = await arrsService.attachFile("arr-1", file);

    expect(api.post).toHaveBeenCalledWith(
      "/arrs/arr-1/file",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    expect(result.fileKey).toBe("arrs/arr-1/doc.pdf");
    expect(result.storageMode).toBe("s3");
  });
});

describe("arrsService — getPdfAccess", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getPdfAccess mapeia entityId para arrId corretamente", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        entityId: "arr-1",
        hasFinalPdf: true,
        availability: "ready",
        message: "PDF disponível",
        fileKey: "arrs/arr-1/final.pdf",
        folderPath: "arrs/arr-1",
        originalName: "final.pdf",
        url: "https://cdn.example.com/arrs/arr-1/final.pdf",
        degraded: false,
      },
    });

    const result = await arrsService.getPdfAccess("arr-1");

    expect(api.get).toHaveBeenCalledWith("/arrs/arr-1/pdf");
    expect(result.arrId).toBe("arr-1");
    expect(result.hasFinalPdf).toBe(true);
    expect(result.availability).toBe("ready");
    expect(result.degraded).toBe(false);
  });

  it("getPdfAccess propaga erro quando o backend não encontra o PDF", async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });

    await expect(arrsService.getPdfAccess("arr-inexistente")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe("arrsService — propagação de erros", () => {
  beforeEach(() => jest.clearAllMocks());

  it("findOne propaga erro 404 do backend", async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });

    await expect(arrsService.findOne("arr-inexistente")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it("create propaga erro 400 do backend", async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 400 } });

    await expect(arrsService.create(basePayload)).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it("delete propaga erro 403 quando o usuário não tem permissão", async () => {
    (api.delete as jest.Mock).mockRejectedValue({ response: { status: 403 } });

    await expect(arrsService.delete("arr-1")).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});
