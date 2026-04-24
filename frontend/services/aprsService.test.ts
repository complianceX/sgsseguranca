import api from "@/lib/api";
import { aprsService } from "@/services/aprsService";
import { enqueueOfflineMutation } from "@/lib/offline-sync";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  TIMEOUT_PDF: 180000,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock("@/lib/offline-sync", () => ({
  enqueueOfflineMutation: jest.fn(),
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

  it("normaliza campos opcionais vazios ao criar APR", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-2",
        numero: "APR-002",
        titulo: "APR Auditoria",
      },
    });

    await aprsService.create({
      numero: "APR-002",
      titulo: "APR Auditoria",
      data_inicio: "2026-03-23",
      data_fim: "2026-03-24",
      site_id: "site-1",
      elaborador_id: "user-1",
      auditado_por_id: "   ",
      data_auditoria: "",
      participants: ["user-1", " ", "user-1"],
      risk_items: [
        {
          atividade_processo: "Inspeção",
          prazo: "",
        },
      ],
    });

    expect(api.post).toHaveBeenCalledWith("/aprs", {
      numero: "APR-002",
      titulo: "APR Auditoria",
      data_inicio: "2026-03-23",
      data_fim: "2026-03-24",
      site_id: "site-1",
      elaborador_id: "user-1",
      participants: ["user-1"],
      auditado_por_id: undefined,
      data_auditoria: undefined,
      risk_items: [
        {
          atividade_processo: "Inspeção",
          prazo: undefined,
        },
      ],
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

  it("nao enfileira APR offline quando o fluxo exige online", async () => {
    const networkError = { code: "ERR_NETWORK" };
    (api.post as jest.Mock).mockRejectedValue(networkError);

    await expect(
      aprsService.create(
        {
          numero: "APR-003",
          titulo: "APR Online Obrigatoria",
          data_inicio: "2026-03-23",
          data_fim: "2026-03-24",
          site_id: "site-1",
          elaborador_id: "user-1",
        },
        { allowOfflineQueue: false },
      ),
    ).rejects.toBe(networkError);

    expect(enqueueOfflineMutation).not.toHaveBeenCalled();
  });

  it("retorna o identificador da fila quando a APR e enfileirada offline", async () => {
    (api.post as jest.Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (enqueueOfflineMutation as jest.Mock).mockResolvedValue({
      id: "queue-1",
      createdAt: "2026-03-27T12:00:00.000Z",
    });

    const result = (await aprsService.create({
      numero: "APR-004",
      titulo: "APR Offline",
      data_inicio: "2026-03-23",
      data_fim: "2026-03-24",
      site_id: "site-1",
      elaborador_id: "user-1",
    })) as { offlineQueued?: boolean; offlineQueueItemId?: string };

    expect(result.offlineQueued).toBe(true);
    expect(result.offlineQueueItemId).toBe("queue-1");
  });

  it("propaga identidade estável e dedupe da fila offline ao criar APR", async () => {
    (api.post as jest.Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (enqueueOfflineMutation as jest.Mock).mockResolvedValue({
      id: "queue-2",
      createdAt: "2026-03-27T12:10:00.000Z",
      deduplicated: true,
    });

    const result = (await aprsService.create(
      {
        numero: "APR-005",
        titulo: "APR Offline Dedupe",
        data_inicio: "2026-03-23",
        data_fim: "2026-03-24",
        site_id: "site-1",
        elaborador_id: "user-1",
      },
      {
        offlineSync: {
          correlationId: "apr:draft:draft-5",
          dedupeKey: "apr:create:draft-5",
          draftId: "draft-5",
          source: "apr_form_test",
        },
      },
    )) as {
      offlineQueued?: boolean;
      offlineQueueItemId?: string;
      offlineQueueDeduplicated?: boolean;
    };

    expect(enqueueOfflineMutation).toHaveBeenCalledWith({
      url: "/aprs",
      method: "post",
      data: {
        numero: "APR-005",
        titulo: "APR Offline Dedupe",
        data_inicio: "2026-03-23",
        data_fim: "2026-03-24",
        site_id: "site-1",
        elaborador_id: "user-1",
      },
      label: "APR",
      correlationId: "apr:draft:draft-5",
      dedupeKey: "apr:create:draft-5",
      meta: {
        module: "apr",
        entityType: "apr_base",
        draftId: "draft-5",
        source: "apr_form_test",
      },
    });
    expect(result.offlineQueueItemId).toBe("queue-2");
    expect(result.offlineQueueDeduplicated).toBe(true);
  });

  it("propaga identidade estável e dedupe da fila offline ao atualizar APR", async () => {
    (api.patch as jest.Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (enqueueOfflineMutation as jest.Mock).mockResolvedValue({
      id: "queue-3",
      createdAt: "2026-03-27T12:20:00.000Z",
      deduplicated: false,
    });

    const result = (await aprsService.update(
      "apr-6",
      {
        titulo: "APR Offline Atualizada",
        participants: ["user-1", "user-1"],
      },
      {
        offlineSync: {
          correlationId: "apr:update:apr-6",
          dedupeKey: "apr:update:apr-6",
          draftId: "draft-6",
          source: "apr_form_test",
        },
      },
    )) as {
      offlineQueued?: boolean;
      offlineQueueItemId?: string;
      offlineQueueDeduplicated?: boolean;
    };

    expect(enqueueOfflineMutation).toHaveBeenCalledWith({
      url: "/aprs/apr-6",
      method: "patch",
      data: {
        titulo: "APR Offline Atualizada",
        participants: ["user-1"],
      },
      label: "APR",
      correlationId: "apr:update:apr-6",
      dedupeKey: "apr:update:apr-6",
      meta: {
        module: "apr",
        entityType: "apr_base",
        draftId: "draft-6",
        source: "apr_form_test",
      },
    });
    expect(result.offlineQueued).toBe(true);
    expect(result.offlineQueueItemId).toBe("queue-3");
    expect(result.offlineQueueDeduplicated).toBe(false);
  });

  it("usa PATCH na rota canonica de aprovacao da APR", async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-approve-1",
        status: "Aprovada",
      },
    });

    const result = await aprsService.approve(
      "apr-approve-1",
      "Aprovacao auditada",
    );

    expect(api.patch).toHaveBeenCalledWith("/aprs/apr-approve-1/approve", {
      reason: "Aprovacao auditada",
    });
    expect(result.status).toBe("Aprovada");
  });

  it("usa PATCH na rota canonica de reprovacao da APR", async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-reject-1",
        status: "Cancelada",
      },
    });

    const result = await aprsService.reject(
      "apr-reject-1",
      "Risco critico sem controle definido",
    );

    expect(api.patch).toHaveBeenCalledWith("/aprs/apr-reject-1/reject", {
      reason: "Risco critico sem controle definido",
    });
    expect(result.status).toBe("Cancelada");
  });

  it("usa PATCH na rota canonica de encerramento da APR", async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: {
        id: "apr-finalize-1",
        status: "Encerrada",
      },
    });

    const result = await aprsService.finalize("apr-finalize-1");

    expect(api.patch).toHaveBeenCalledWith("/aprs/apr-finalize-1/finalize");
    expect(result.status).toBe("Encerrada");
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
      { timeout: 180000 },
    );
    expect(result.generated).toBe(true);
    expect(result.hasFinalPdf).toBe(true);
  });

  it("envia filtros operacionais completos ao backend na paginação da APR", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        lastPage: 1,
      },
    });

    await aprsService.findPaginated({
      page: 2,
      limit: 30,
      search: "APR-2026",
      status: "Pendente",
      siteId: "site-1",
      responsibleId: "user-7",
      dueFilter: "next-7-days",
      sort: "deadline-asc",
    });

    expect(api.get).toHaveBeenCalledWith("/aprs", {
      params: {
        page: 2,
        limit: 30,
        search: "APR-2026",
        status: "Pendente",
        site_id: "site-1",
        responsible_id: "user-7",
        due_filter: "next-7-days",
        sort: "deadline-asc",
      },
    });
  });
});
