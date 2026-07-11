import { drawChecklistTable } from "./checklistTable";

const drawSemanticTable = jest.fn();

jest.mock("../components/SemanticTable", () => ({
  drawSemanticTable: (...args: unknown[]) => drawSemanticTable(...args),
}));

describe("drawChecklistTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("oculta a coluna de justificativa quando todas estao vazias", () => {
    drawChecklistTable(
      {} as never,
      jest.fn() as never,
      "Checklist PT",
      [
        { question: "Linha de vida", answer: "Sim" },
        { question: "Ancoragem", answer: "Sim", justification: "" },
      ],
    );

    expect(drawSemanticTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [["Pergunta", "Resposta"]],
        body: [
          ["Linha de vida", "Sim"],
          ["Ancoragem", "Sim"],
        ],
      }),
    );
  });

  it("mantem a coluna de justificativa quando ha conteudo relevante", () => {
    drawChecklistTable(
      {} as never,
      jest.fn() as never,
      "Checklist PT",
      [{ question: "Linha de vida", answer: "Nao", justification: "Ajuste pendente" }],
    );

    expect(drawSemanticTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [["Pergunta", "Resposta", "Justificativa"]],
        body: [["Linha de vida", "Nao", "Ajuste pendente"]],
      }),
    );
  });
});
