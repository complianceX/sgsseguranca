import { drawDdsBlueprint } from "./ddsBlueprint";

const drawDocumentIdentityRail = jest.fn();
const drawEvidenceGallery = jest.fn().mockResolvedValue(undefined);
const drawExecutiveSummaryStrip = jest.fn();
const drawGovernanceClosingBlock = jest.fn().mockResolvedValue(undefined);
const drawMetadataGrid = jest.fn();
const drawNarrativeSection = jest.fn();
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
        title: "Registro fotografico da equipe",
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
});
