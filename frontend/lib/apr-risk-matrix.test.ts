import { calculateAprRiskEvaluation } from "./apr-risk-matrix";

describe("calculateAprRiskEvaluation", () => {
  it("espelha a matriz APR em tempo real no frontend", () => {
    expect(calculateAprRiskEvaluation("1", "2")).toEqual({
      score: 2,
      categoria: "Aceitável",
      prioridade: "Não prioritário",
    });
    expect(calculateAprRiskEvaluation("2", "2")).toEqual({
      score: 4,
      categoria: "Atenção",
      prioridade: "Prioridade básica",
    });
    expect(calculateAprRiskEvaluation("2", "3")).toEqual({
      score: 6,
      categoria: "Substancial",
      prioridade: "Prioridade preferencial",
    });
    expect(calculateAprRiskEvaluation("3", "3")).toEqual({
      score: 9,
      categoria: "Crítico",
      prioridade: "Prioridade máxima",
    });
  });
});
