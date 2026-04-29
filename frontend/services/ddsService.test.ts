import api from "@/lib/api";
import { ddsService } from "@/services/ddsService";

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

describe("ddsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("remove company_id do payload de criacao porque tenant vem do contexto autenticado", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        id: "dds-1",
        tema: "DDS seguro",
        company_id: "company-1",
      },
    });

    await ddsService.create({
      tema: "DDS seguro",
      company_id: "company-spoofed",
      site_id: "site-1",
      facilitador_id: "user-1",
      participants: ["user-1"],
    });

    expect(api.post).toHaveBeenCalledWith("/dds", {
      tema: "DDS seguro",
      site_id: "site-1",
      facilitador_id: "user-1",
      participants: ["user-1"],
    });
  });

  it("remove company_id do payload de atualizacao e preserva confirmacao de reset de assinaturas", async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: {
        id: "dds-1",
        tema: "DDS revisado",
        company_id: "company-1",
      },
    });

    await ddsService.update("dds-1", {
      tema: "DDS revisado",
      company_id: "company-spoofed",
      confirm_signature_reset: true,
    });

    expect(api.patch).toHaveBeenCalledWith("/dds/dds-1", {
      tema: "DDS revisado",
      confirm_signature_reset: true,
    });
  });

  it("lista pessoas do DDS pela rota dedicada com tenant no header", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: [
          {
            id: "user-1",
            nome: "Ana TST",
            company_id: "company-1",
            site_id: "site-1",
            status: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
        lastPage: 1,
      },
    });

    await ddsService.listPeople({
      page: 1,
      limit: 100,
      companyId: "company-1",
      siteId: "site-1",
    });

    expect(api.get).toHaveBeenCalledWith("/dds/people", {
      params: {
        page: 1,
        limit: 100,
        site_id: "site-1",
      },
      headers: { "x-company-id": "company-1" },
    });
  });

  it("lista todas as pessoas do DDS paginando por obra", async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: "user-1",
              nome: "Ana TST",
              company_id: "company-1",
              site_id: "site-1",
              status: true,
            },
          ],
          total: 2,
          page: 1,
          limit: 1,
          lastPage: 2,
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: "user-2",
              nome: "Bruno Eletricista",
              company_id: "company-1",
              site_id: "site-1",
              status: true,
            },
          ],
          total: 2,
          page: 2,
          limit: 1,
          lastPage: 2,
        },
      });

    await expect(
      ddsService.listAllPeople({
        companyId: "company-1",
        siteId: "site-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ id: "user-2" }),
    ]);

    expect(api.get).toHaveBeenNthCalledWith(1, "/dds/people", {
      params: {
        page: 1,
        limit: 100,
        site_id: "site-1",
      },
      headers: { "x-company-id": "company-1" },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/dds/people", {
      params: {
        page: 2,
        limit: 100,
        site_id: "site-1",
      },
      headers: { "x-company-id": "company-1" },
    });
  });

  it("envia substituicao de assinaturas do DDS para a rota dedicada", async () => {
    (api.put as jest.Mock).mockResolvedValue({
      data: {
        participantSignatures: 2,
        teamPhotos: 1,
        duplicatePhotoWarnings: [],
      },
    });

    await expect(
      ddsService.replaceSignatures("dds-1", {
        participant_signatures: [
          {
            user_id: "user-1",
            signature_data: "sig-1",
            type: "digital",
          },
        ],
        team_photos: [],
      }),
    ).resolves.toEqual({
      participantSignatures: 2,
      teamPhotos: 1,
      duplicatePhotoWarnings: [],
    });

    expect(api.put).toHaveBeenCalledWith("/dds/dds-1/signatures", {
      participant_signatures: [
        {
          user_id: "user-1",
          signature_data: "sig-1",
          type: "digital",
        },
      ],
      team_photos: [],
    });
  });

  it("busca assinaturas do DDS pela rota do modulo", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [
        {
          id: "sig-1",
          document_id: "dds-1",
          document_type: "DDS",
          signature_data: "sig",
          type: "digital",
        },
      ],
    });

    await expect(ddsService.listSignatures("dds-1")).resolves.toHaveLength(1);

    expect(api.get).toHaveBeenCalledWith("/dds/dds-1/signatures");
  });

  it("busca contexto de validacao publica do DDS", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        documentCode: "DDS-2026-DDS1",
        token: "validation-token",
      },
    });

    await expect(ddsService.getValidationContext("dds-1")).resolves.toEqual({
      documentCode: "DDS-2026-DDS1",
      token: "validation-token",
    });

    expect(api.get).toHaveBeenCalledWith("/dds/dds-1/validation-context");
  });

  it("inicia fluxo de aprovacao do DDS na rota governada", async () => {
    const flow = {
      ddsId: "dds-1",
      companyId: "company-1",
      activeCycle: 1,
      status: "pending",
      currentStep: null,
      steps: [],
      events: [],
    };
    (api.post as jest.Mock).mockResolvedValue({ data: flow });

    await expect(ddsService.initializeApprovalFlow("dds-1")).resolves.toEqual(
      flow,
    );

    expect(api.post).toHaveBeenCalledWith(
      "/dds/dds-1/approvals/initialize",
      {},
    );
  });

  it("carrega o overview interno de observabilidade DDS", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        generatedAt: "2026-04-18T10:00:00.000Z",
        tenantScope: "tenant",
        portfolio: { total: 10 },
      },
    });

    await expect(ddsService.getObservabilityOverview()).resolves.toMatchObject({
      tenantScope: "tenant",
      portfolio: { total: 10 },
    });

    expect(api.get).toHaveBeenCalledWith("/dds/observability/overview");
  });

  it("carrega o preview de alertas operacionais DDS", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        generatedAt: "2026-04-18T10:00:00.000Z",
        tenantScope: "tenant",
        automationEnabled: true,
        recipients: {
          notificationUsers: 2,
          emailRecipients: ["compliance@example.com"],
        },
        alerts: [{ code: "dds_public_suspicious_spike" }],
        investigationQueue: [],
      },
    });

    await expect(
      ddsService.getObservabilityAlertsPreview(),
    ).resolves.toMatchObject({
      tenantScope: "tenant",
      recipients: {
        notificationUsers: 2,
      },
      alerts: [{ code: "dds_public_suspicious_spike" }],
    });

    expect(api.get).toHaveBeenCalledWith("/dds/observability/alerts");
  });

  it("nao envia company_id em filtros tenant-scoped de arquivos e hashes", async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: new Blob(["pdf"]) })
      .mockResolvedValueOnce({ data: [] });

    await ddsService.listStoredFiles({
      company_id: "company-spoofed",
      year: 2026,
      week: 12,
    });
    await ddsService.downloadWeeklyBundle({
      company_id: "company-spoofed",
      year: 2026,
      week: 12,
    });
    await ddsService.getHistoricalPhotoHashes(25, "dds-1");

    expect(api.get).toHaveBeenNthCalledWith(1, "/dds/files/list", {
      params: { year: 2026, week: 12 },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/dds/files/weekly-bundle", {
      params: { year: 2026, week: 12 },
      responseType: "blob",
    });
    expect(api.get).toHaveBeenNthCalledWith(3, "/dds/historical-photo-hashes", {
      params: { limit: 25, exclude_id: "dds-1" },
    });
  });

  it("dispara alertas operacionais DDS manualmente", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        generatedAt: "2026-04-18T10:00:00.000Z",
        tenantScope: "tenant",
        dispatched: true,
        notificationsCreated: 3,
        emailSent: true,
        webhookSent: false,
        alerts: [{ code: "dds_governance_backlog" }],
      },
    });

    await expect(
      ddsService.dispatchObservabilityAlerts(),
    ).resolves.toMatchObject({
      dispatched: true,
      notificationsCreated: 3,
      emailSent: true,
      alerts: [{ code: "dds_governance_backlog" }],
    });

    expect(api.post).toHaveBeenCalledWith("/dds/observability/alerts/dispatch");
  });

  it("aprova, reprova e reabre etapas do fluxo DDS", async () => {
    const flow = {
      ddsId: "dds-1",
      companyId: "company-1",
      activeCycle: 1,
      status: "pending",
      currentStep: null,
      steps: [],
      events: [],
    };
    (api.post as jest.Mock).mockResolvedValue({ data: flow });

    await ddsService.approveApprovalStep("dds-1", "approval-1", {
      reason: "Validado.",
      pin: "1234",
    });
    await ddsService.rejectApprovalStep("dds-1", "approval-1", {
      reason: "Evidências insuficientes.",
      pin: "1234",
    });
    await ddsService.reopenApprovalFlow("dds-1", {
      reason: "DDS corrigido e reenviado.",
      pin: "1234",
    });

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/dds/dds-1/approvals/approval-1/approve",
      { reason: "Validado.", pin: "1234" },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/dds/dds-1/approvals/approval-1/reject",
      { reason: "Evidências insuficientes.", pin: "1234" },
    );
    expect(api.post).toHaveBeenNthCalledWith(3, "/dds/dds-1/approvals/reopen", {
      reason: "DDS corrigido e reenviado.",
      pin: "1234",
    });
  });
});
