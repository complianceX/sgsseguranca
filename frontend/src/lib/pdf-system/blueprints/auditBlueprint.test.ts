import { drawAuditBlueprint } from "./auditBlueprint";

const drawDocumentIdentityRail = jest.fn();
const drawExecutiveSummaryStrip = jest.fn();
const drawGovernanceClosingBlock = jest.fn().mockResolvedValue(undefined);
const drawMetadataGrid = jest.fn();
const drawNarrativeSection = jest.fn();
const drawComplianceTable = jest.fn();
const drawActionPlanTable = jest.fn();

jest.mock("../components", () => ({
  drawDocumentIdentityRail: (...args: unknown[]) =>
    drawDocumentIdentityRail(...args),
  drawExecutiveSummaryStrip: (...args: unknown[]) =>
    drawExecutiveSummaryStrip(...args),
  drawGovernanceClosingBlock: (...args: unknown[]) =>
    drawGovernanceClosingBlock(...args),
  drawMetadataGrid: (...args: unknown[]) => drawMetadataGrid(...args),
  drawNarrativeSection: (...args: unknown[]) => drawNarrativeSection(...args),
}));

jest.mock("../tables", () => ({
  drawComplianceTable: (...args: unknown[]) => drawComplianceTable(...args),
  drawActionPlanTable: (...args: unknown[]) => drawActionPlanTable(...args),
}));

describe("drawAuditBlueprint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inclui as seções completas do formulario no PDF final", async () => {
    await drawAuditBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: "audit-1",
        titulo: "Auditoria HSE",
        data_auditoria: "2026-05-10",
        tipo_auditoria: "Interna",
        company_id: "company-1",
        site_id: "site-1",
        auditor_id: "user-1",
        site: { nome: "Obra Central" },
        auditor: { nome: "Maria Técnica" },
        representantes_empresa: "João, Ana",
        caracterizacao: {
          cnae: "71.20-1-00",
          grau_risco: "3",
          num_trabalhadores: 42,
          turnos: "Diurno",
          atividades_principais: "Inspeção de campo",
        },
        objetivo: "Verificar conformidade",
        escopo: "Processos críticos",
        metodologia: "Inspeção documental",
        referencias: ["NR-1", "NR-12"],
        documentos_avaliados: ["PGR", "PCMSO"],
        resultados_conformidades: ["Treinamento em dia"],
        resultados_nao_conformidades: [
          {
            descricao: "Ausência de bloqueio",
            requisito: "NR-12",
            evidencia: "Foto 1",
            classificacao: "Grave",
          },
        ],
        resultados_observacoes: ["Sinalização parcial"],
        resultados_oportunidades: ["Reforçar DDS"],
        avaliacao_riscos: [
          {
            perigo: "Queda",
            classificacao: "Alta",
            impactos: "Lesão",
            medidas_controle: "Linha de vida",
          },
        ],
        plano_acao: [
          {
            item: "1",
            acao: "Corrigir bloqueio",
            responsavel: "Carlos",
            prazo: "20/05/2026",
            status: "Aberto",
          },
        ],
        conclusao: "Aprovada com ressalvas",
      } as never,
      "AUD-1",
      "https://example.com/validar/AUD-1",
    );

    expect(drawMetadataGrid).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Caracterização operacional",
      }),
    );
    expect(drawNarrativeSection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Documentos avaliados",
      }),
    );
    expect(drawNarrativeSection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Avaliação de riscos",
      }),
    );
    expect(drawComplianceTable).toHaveBeenCalledTimes(1);
    expect(drawActionPlanTable).toHaveBeenCalledTimes(1);
    expect(drawGovernanceClosingBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: "AUD-1",
      }),
    );
  });
});
