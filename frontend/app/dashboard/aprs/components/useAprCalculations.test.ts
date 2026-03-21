import {
  computeAprRiskSummary,
  evaluateAprRisk,
  getActionCriteriaText,
} from "./useAprCalculations";

describe("useAprCalculations helpers", () => {
  it("avalia categoria, prioridade e critério de ação a partir da matriz", () => {
    expect(evaluateAprRisk("3", "3")).toEqual({
      score: 9,
      categoria: "Crítico",
      prioridade: "Prioridade máxima",
      actionCriteria: "Interromper e agir imediatamente.",
    });
  });

  it("resume linhas prontas, incompletas e sem medidas preventivas", () => {
    const summary = computeAprRiskSummary([
      {
        atividade_processo: "Montagem",
        agente_ambiental: "Ruído",
        condicao_perigosa: "Queda de materiais",
        probabilidade: "3",
        severidade: "3",
        medidas_prevencao: "Isolar área e usar talabarte",
      },
      {
        atividade_processo: "Corte",
        probabilidade: "2",
        severidade: "3",
        medidas_prevencao: "",
      },
      {
        atividade_processo: "Movimentação",
        probabilidade: "",
        severidade: "2",
        medidas_prevencao: "",
      },
      {},
    ]);

    expect(summary).toEqual({
      total: 4,
      aceitavel: 0,
      atencao: 0,
      substancial: 1,
      critico: 1,
      incompletas: 2,
      semMedidasPreventivas: 2,
      prontas: 1,
    });
  });

  it("expõe o texto longo do critério de ação", () => {
    expect(getActionCriteriaText("Substancial", "long")).toBe(
      "Trabalho não deve ser iniciado/continuado sem redução de risco e controles eficazes.",
    );
  });
});
