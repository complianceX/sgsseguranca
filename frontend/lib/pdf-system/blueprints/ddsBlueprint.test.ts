import { drawDdsBlueprint } from "./ddsBlueprint";

const drawDocumentIdentityRail = jest.fn();
const drawEvidenceGallery = jest.fn().mockResolvedValue(undefined);
const drawExecutiveSummaryStrip = jest.fn();
const drawGovernanceClosingBlock = jest.fn().mockResolvedValue(undefined);
const drawMetadataGrid = jest.fn();
const drawNarrativeSection = jest.fn();
const drawSemanticTable = jest.fn();
const drawParticipantTable = jest.fn();

jest.mock("../components", () => ({
  drawDocumentIdentityRail: (...args: unknown[]) =>
    drawDocumentIdentityRail(...args),
  drawEvidenceGallery: (...args: unknown[]) => drawEvidenceGallery(...args),
  drawExecutiveSummaryStrip: (...args: unknown[]) =>
    drawExecutiveSummaryStrip(...args),
  drawGovernanceClosingBlock: (...args: unknown[]) =>
    drawGovernanceClosingBlock(...args),
  drawMetadataGrid: (...args: unknown[]) => drawMetadataGrid(...args),
  drawNarrativeSection: (...args: unknown[]) => drawNarrativeSection(...args),
  drawSemanticTable: (...args: unknown[]) => drawSemanticTable(...args),
}));

jest.mock("../tables", () => ({
  drawParticipantTable: (...args: unknown[]) => drawParticipantTable(...args),
}));

describe("drawDdsBlueprint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("nao informa validade e inclui fotos da equipe na galeria", async () => {
    await drawDdsBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: "dds-1",
        tema: "DDS em altura",
        conteudo: "Conteudo do DDS",
        data: "2026-03-16",
        status: "publicado",
        company_id: "company-1",
        site_id: "site-1",
        facilitador_id: "user-1",
        participants: [{ id: "user-1", nome: "Joao" }],
        site: { nome: "Obra Central" },
        facilitador: { nome: "Maria" },
      } as never,
      [
        {
          user_id: "user-1",
          type: "digital",
          signature_data: "assinatura",
          user: { nome: "Joao" },
          signed_at: "2026-03-16T10:00:00.000Z",
        },
        {
          user_id: "user-1",
          type: "team_photo_1",
          signature_data: JSON.stringify({
            imageData: "data:image/jpeg;base64,AAA",
            capturedAt: "2026-03-16T09:00:00.000Z",
            hash: "hash-foto-1",
          }),
        },
        {
          user_id: "user-1",
          type: "team_photo_2",
          signature_data: "data:image/jpeg;base64,LEGACY",
          created_at: "2026-03-16T09:10:00.000Z",
        },
        {
          user_id: "user-1",
          type: "team_photo_reuse_justification",
          signature_data: "Justificativa",
        },
      ] as never,
      "DDS-2026-TESTE",
      "https://example.com/validar/DDS-2026-TESTE",
    );

    expect(drawDocumentIdentityRail).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ validity: expect.anything() }),
    );

    expect(drawEvidenceGallery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Registro fotográfico da equipe",
        items: [
          expect.objectContaining({
            source: "data:image/jpeg;base64,AAA",
          }),
          expect.objectContaining({
            source: "data:image/jpeg;base64,LEGACY",
          }),
        ],
      }),
    );

    expect(drawGovernanceClosingBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signatures: [
          expect.objectContaining({
            name: "Joao",
          }),
        ],
      }),
    );
  });

  it("inclui rastreabilidade e hash do PDF final no bloco de governanca", async () => {
    await drawDdsBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: "dds-1",
        tema: "DDS final",
        conteudo: "Conteudo",
        data: "2026-03-16",
        status: "auditado",
        company_id: "company-1",
        site_id: "site-1",
        facilitador_id: "user-1",
        participant_count: 3,
        final_pdf_hash_sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        pdf_generated_at: "2026-03-16T10:00:00.000Z",
        emitted_ip: "10.10.10.10",
        emitted_by: { nome: "Tecnico SST" },
      } as never,
      [],
      "DDS-2026-DDS1",
      "https://example.com/validar/DDS-2026-DDS1?token=token",
    );

    expect(drawMetadataGrid).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Rastreabilidade do PDF final",
      }),
    );
    expect(drawGovernanceClosingBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    );
  });

  it("inclui etapas e historico de aprovacao no PDF do DDS", async () => {
    await drawDdsBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: "dds-1",
        tema: "DDS aprovado",
        conteudo: "Conteudo",
        data: "2026-03-16",
        status: "auditado",
        company_id: "company-1",
        site_id: "site-1",
        facilitador_id: "user-1",
        approval_flow: {
          ddsId: "dds-1",
          companyId: "company-1",
          activeCycle: 1,
          status: "approved",
          currentStep: null,
          steps: [
            {
              level_order: 1,
              title: "Conferência técnica SST",
              approver_role: "Técnico de Segurança do Trabalho (TST)",
              status: "approved",
              pending_record_id: null,
              decided_by_user_id: "user-1",
              decided_at: "2026-03-16T10:00:00.000Z",
              decision_reason: "Validado.",
              event_hash:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              actor_signature_id: "signature-1",
              actor_signature_hash:
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              actor_signature_signed_at: "2026-03-16T10:00:00.000Z",
              actor_signature_timestamp_authority: "authority-1",
            },
          ],
          events: [
            {
              id: "approval-1",
              company_id: "company-1",
              dds_id: "dds-1",
              cycle: 1,
              level_order: 1,
              title: "Conferência técnica SST",
              approver_role: "Técnico de Segurança do Trabalho (TST)",
              action: "approved",
              actor_user_id: "user-1",
              actor: { nome: "Maria Técnica" },
              decision_reason: "Validado.",
              decided_ip: "10.10.10.10",
              event_at: "2026-03-16T10:00:00.000Z",
              previous_event_hash: null,
              event_hash:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              actor_signature_id: "signature-1",
              actor_signature_hash:
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              actor_signature_signed_at: "2026-03-16T10:00:00.000Z",
              actor_signature_timestamp_authority: "authority-1",
            },
          ],
        },
      } as never,
      [],
      "DDS-2026-DDS1",
      "https://example.com/validar/DDS-2026-DDS1?token=token",
    );

    expect(drawMetadataGrid).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Fluxo de aprovação rastreável",
      }),
    );
    expect(drawSemanticTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Etapas de aprovação",
        body: [
          expect.arrayContaining([
            1,
            "Conferência técnica SST",
            "Técnico de Segurança do Trabalho (TST)",
            "Aprovado",
            expect.stringContaining("cccccccccccccccccc"),
          ]),
        ],
      }),
    );
    expect(drawSemanticTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Histórico técnico de aprovação",
      }),
    );
  });
});
