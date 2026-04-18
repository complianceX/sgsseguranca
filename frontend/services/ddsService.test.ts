import api from "@/lib/api";
import { ddsService } from "@/services/ddsService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe("ddsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    expect(api.post).toHaveBeenCalledWith("/dds/dds-1/approvals/initialize", {});
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

    await expect(ddsService.getObservabilityAlertsPreview()).resolves.toMatchObject({
      tenantScope: "tenant",
      recipients: {
        notificationUsers: 2,
      },
      alerts: [{ code: "dds_public_suspicious_spike" }],
    });

    expect(api.get).toHaveBeenCalledWith("/dds/observability/alerts");
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

    await expect(ddsService.dispatchObservabilityAlerts()).resolves.toMatchObject({
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
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      "/dds/dds-1/approvals/reopen",
      { reason: "DDS corrigido e reenviado.", pin: "1234" },
    );
  });
});
