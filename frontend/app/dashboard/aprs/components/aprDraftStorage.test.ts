import {
  clearAprDraft,
  clearAprDraftsForOtherTenants,
  readAprDraft,
  sanitizeAprDraftValues,
  writeAprDraft,
} from "./aprDraftStorage";

describe("aprDraftStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("remove campos transientes e nunca persiste material de assinatura", () => {
    const sanitized = sanitizeAprDraftValues({
      numero: "APR-001",
      titulo: "APR Estrutural",
      company_id: "company-1",
      pdf_signed: true,
      participants: ["user-1"],
      itens_risco: [
        {
          atividade_processo: "Corte",
          medidas_prevencao: "Bloqueio",
          cpf: "12345678900",
          evidencia_foto: "data:image/png;base64,abc",
          token: "secret-token",
          private_url: "https://storage.local/private",
        },
      ],
    } as unknown as Parameters<typeof sanitizeAprDraftValues>[0]);

    expect(sanitized).toEqual({
      numero: "APR-001",
      titulo: "APR Estrutural",
      company_id: "company-1",
      itens_risco: [
        {
          atividade_processo: "Corte",
          medidas_prevencao: "Bloqueio",
        },
      ],
    });
    expect("pdf_signed" in sanitized).toBe(false);
    expect("participants" in sanitized).toBe(false);
  });

  it("migra rascunho legado removendo assinaturas persistidas", () => {
    window.localStorage.setItem(
      "legacy-key",
      JSON.stringify({
        step: 2,
        values: {
          titulo: "APR Legada",
          participants: ["user-1"],
        },
        signatures: {
          "user-1": {
            data: "base64-assinatura",
            type: "draw",
          },
        },
      }),
    );

    const result = readAprDraft("primary-key", "legacy-key");

    expect(result.removedSensitiveState).toBe(true);
    expect(result.migratedFromLegacy).toBe(true);
    expect(result.draft?.values.titulo).toBe("APR Legada");
    expect(result.draft?.metadata).toEqual(
      expect.objectContaining({
        draftId: expect.any(String),
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
      }),
    );
    expect(window.localStorage.getItem("legacy-key")).toBeNull();
    expect(window.localStorage.getItem("primary-key")).not.toContain(
      "base64-assinatura",
    );
  });

  it("descarta rascunho corrompido para evitar restauracao insegura", () => {
    window.localStorage.setItem("primary-key", "{json invalido");

    const result = readAprDraft("primary-key");

    expect(result.corrupted).toBe(true);
    expect(result.draft).toBeNull();
    expect(window.localStorage.getItem("primary-key")).toBeNull();
  });

  it("migra formato versionado antigo para o schema atual com draftId estavel", () => {
    window.localStorage.setItem(
      "primary-key",
      JSON.stringify({
        version: 2,
        step: 2,
        values: {
          titulo: "APR v2",
          participants: ["user-1"],
        },
        metadata: {},
      }),
    );

    const result = readAprDraft("primary-key");
    const stored = window.localStorage.getItem("primary-key");

    expect(result.corrupted).toBe(false);
    expect(result.migratedFromLegacy).toBe(true);
    expect(result.draft?.version).toBe(3);
    expect(result.draft?.metadata.draftId).toBeTruthy();
    expect(stored).toContain('"version":3');
    expect(stored).toContain('"draftId":');
  });

  it("grava e limpa o rascunho versionado da APR", () => {
    writeAprDraft("primary-key", {
      version: 3,
      step: 3,
      values: {
        titulo: "APR Protegida",
        descricao: "Sem assinatura local",
      },
      metadata: {
        draftId: "draft-1",
        tenantId: "company-1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        pendingOfflineSync: {
          draftId: "draft-1",
          queuedAt: "2026-03-27T12:00:00.000Z",
          lastUpdatedAt: "2026-03-27T12:00:00.000Z",
          queueItemId: "queue-1",
          dedupeKey: "apr:create:draft-1",
          intent: "save",
          status: "queued",
        },
      },
    });

    const stored = window.localStorage.getItem("primary-key");
    expect(stored).toContain('"version":3');
    expect(stored).toContain('"draftId":"draft-1"');
    expect(stored).toContain('"tenantId":"company-1"');
    expect(stored).not.toContain("signatures");

    clearAprDraft("primary-key");
    expect(window.localStorage.getItem("primary-key")).toBeNull();
  });

  it("descarta rascunho expirado pelo TTL curto", () => {
    window.localStorage.setItem(
      "primary-key",
      JSON.stringify({
        version: 3,
        step: 1,
        values: { titulo: "APR expirada" },
        metadata: {
          draftId: "draft-expired",
          createdAt: new Date(Date.now() - 120_000).toISOString(),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      }),
    );

    const result = readAprDraft("primary-key");

    expect(result.expired).toBe(true);
    expect(result.draft).toBeNull();
    expect(window.localStorage.getItem("primary-key")).toBeNull();
  });

  it("limpa rascunhos de outros tenants ao trocar de empresa", () => {
    window.localStorage.setItem("gst.apr.wizard.draft.company-1", "{}");
    window.localStorage.setItem("gst.apr.wizard.draft.company-2", "{}");
    window.localStorage.setItem("compliancex.apr.wizard.draft.company-3", "{}");

    clearAprDraftsForOtherTenants("company-2");

    expect(
      window.localStorage.getItem("gst.apr.wizard.draft.company-1"),
    ).toBeNull();
    expect(window.localStorage.getItem("gst.apr.wizard.draft.company-2")).toBe(
      "{}",
    );
    expect(
      window.localStorage.getItem("compliancex.apr.wizard.draft.company-3"),
    ).toBeNull();
  });
});
