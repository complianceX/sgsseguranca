import api from "@/lib/api";
import { documentImportService } from "@/services/documentImportService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe("documentImportService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("envia o documento para a rota oficial e retorna o contrato de enqueue", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        queued: true,
        documentId: "doc-1",
        status: "QUEUED",
        statusUrl: "/documents/import/doc-1/status",
        reused: false,
        replayState: "new",
        idempotencyKey: "idem-1",
        message: "Documento recebido e enviado para processamento assíncrono.",
        job: {
          jobId: "job-1",
          queueState: "waiting",
          attemptsMade: 0,
          maxAttempts: 3,
          deadLettered: false,
        },
      },
    });

    const file = new File(["pdf"], "apr.pdf", { type: "application/pdf" });

    await expect(
      documentImportService.importDocument({
        file,
        empresaId: "company-1",
        tipoDocumento: "APR",
        idempotencyKey: "idem-1",
      }),
    ).resolves.toMatchObject({
      success: true,
      queued: true,
      documentId: "doc-1",
      status: "QUEUED",
      statusUrl: "/documents/import/doc-1/status",
      reused: false,
      job: {
        jobId: "job-1",
      },
    });

    expect(api.post).toHaveBeenCalledWith(
      "/documents/import",
      expect.any(FormData),
      {
        headers: {
          "Idempotency-Key": "idem-1",
        },
      },
    );
  });

  it("consulta o status da importação pela rota oficial", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        documentId: "doc-1",
        status: "PROCESSING",
        completed: false,
        failed: false,
        statusUrl: "/documents/import/doc-1/status",
        message: "Documento em extração de conteúdo.",
        job: {
          jobId: "job-1",
          queueState: "active",
          attemptsMade: 1,
          maxAttempts: 3,
          lastAttemptAt: "2026-03-20T12:00:00.000Z",
          deadLettered: false,
        },
      },
    });

    await expect(
      documentImportService.getImportStatus("doc-1"),
    ).resolves.toMatchObject({
      documentId: "doc-1",
      status: "PROCESSING",
      job: {
        queueState: "active",
      },
    });

    expect(api.get).toHaveBeenCalledWith(
      "/documents/import/doc-1/status",
      undefined,
    );
  });

  it("encaminha AbortSignal na consulta de status", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        documentId: "doc-1",
        status: "FAILED",
        completed: false,
        failed: true,
        statusUrl: "/documents/import/doc-1/status",
        message: "Falhou.",
        job: {
          jobId: "job-1",
          queueState: "failed",
          attemptsMade: 1,
          maxAttempts: 3,
          deadLettered: false,
        },
      },
    });
    const controller = new AbortController();

    await documentImportService.getImportStatus("doc-1", controller.signal);

    expect(api.get).toHaveBeenCalledWith("/documents/import/doc-1/status", {
      signal: controller.signal,
    });
  });

  it("consulta prévia DDS tenant-scoped da importação", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        documentId: "doc-1",
        preview: {
          tema: "DDS Importado",
          conteudo: "Conteúdo extraído",
          data: "2026-03-20",
          participantesSugeridos: ["Ana TST"],
          pendencias: [],
        },
      },
    });

    await expect(
      documentImportService.getDdsDraftPreview("doc-1"),
    ).resolves.toMatchObject({
      documentId: "doc-1",
      preview: {
        tema: "DDS Importado",
      },
    });

    expect(api.get).toHaveBeenCalledWith("/documents/import/doc-1/dds-draft");
  });

  it("cria rascunho DDS a partir de importação validada", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        documentId: "doc-1",
        ddsId: "dds-1",
        status: "rascunho",
      },
    });

    await expect(
      documentImportService.createDdsDraftFromImport("doc-1", {
        tema: "DDS Validado",
        conteudo: "Conteúdo validado",
        data: "2026-03-20",
        site_id: "site-1",
        facilitador_id: "user-1",
        participants: ["user-2"],
      }),
    ).resolves.toEqual({
      documentId: "doc-1",
      ddsId: "dds-1",
      status: "rascunho",
    });

    expect(api.post).toHaveBeenCalledWith("/documents/import/doc-1/dds-draft", {
      tema: "DDS Validado",
      conteudo: "Conteúdo validado",
      data: "2026-03-20",
      site_id: "site-1",
      facilitador_id: "user-1",
      participants: ["user-2"],
    });
  });
});
