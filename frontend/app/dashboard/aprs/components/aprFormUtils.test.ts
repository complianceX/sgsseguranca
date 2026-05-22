import {
  buildRiskRowKey,
  createEmptyRiskRow,
  formatDocumentDate,
  formatDocumentPeriod,
  inferAprDocumentRiskLevel,
  mapPersistedRiskItemToFormRow,
  normalizeDocumentToken,
  normalizeRiskRow,
  parseRiskScaleNumber,
  splitDocumentTokens,
  uniqueDocumentTokens,
  type AprFormRiskRow,
} from "./aprFormUtils";

describe("aprFormUtils", () => {
  it("cria uma linha de risco vazia com todos os campos esperados", () => {
    expect(createEmptyRiskRow()).toEqual({
      atividade_processo: "",
      etapa: "",
      agente_ambiental: "",
      condicao_perigosa: "",
      fontes_circunstancias: "",
      possiveis_lesoes: "",
      probabilidade: "",
      severidade: "",
      categoria_risco: "",
      medidas_prevencao: "",
      epc: "",
      epi: "",
      permissao_trabalho: "",
      normas_relacionadas: "",
      responsavel: "",
      prazo: "",
      status_acao: "",
    });
  });

  it("normaliza tokens e remove duplicados sem depender de acentos ou caixa", () => {
    expect(normalizeDocumentToken("  Atenção Crítica  ")).toBe(
      "atencao critica",
    );
    expect(
      uniqueDocumentTokens([
        "NR-35",
        " nr-35 ",
        "Proteção coletiva",
        "protecao coletiva",
        "",
      ]),
    ).toEqual(["NR-35", "Proteção coletiva"]);
  });

  it("divide campos textuais em tokens por vírgula, quebra de linha, ponto e vírgula ou pipe", () => {
    expect(splitDocumentTokens("Capacete, Luva\nTalabarte; Cone | Óculos")).toEqual(
      ["Capacete", "Luva", "Talabarte", "Cone", "Óculos"],
    );
  });

  it("infere nível de risco por categoria textual antes de cair no score", () => {
    expect(
      inferAprDocumentRiskLevel({
        ...createEmptyRiskRow(),
        categoria_risco: "Crítico",
        probabilidade: "1",
        severidade: "1",
      }),
    ).toBe("critico");
    expect(
      inferAprDocumentRiskLevel({
        ...createEmptyRiskRow(),
        categoria_risco: "Atenção",
      }),
    ).toBe("medio");
  });

  it("infere nível de risco pelo produto de probabilidade e severidade", () => {
    expect(parseRiskScaleNumber("P3")).toBe(3);
    expect(
      inferAprDocumentRiskLevel({
        ...createEmptyRiskRow(),
        probabilidade: "3",
        severidade: "3",
      }),
    ).toBe("critico");
    expect(
      inferAprDocumentRiskLevel({
        ...createEmptyRiskRow(),
        probabilidade: "2",
        severidade: "2",
      }),
    ).toBe("medio");
  });

  it("formata datas e períodos do documento de forma estável", () => {
    expect(formatDocumentDate("2026-05-22")).toBe("22/05/2026");
    expect(formatDocumentDate("")).toBe("Não definida");
    expect(formatDocumentPeriod("2026-05-22", "2026-05-23")).toBe(
      "22/05/2026 até 23/05/2026",
    );
    expect(formatDocumentPeriod(undefined, undefined)).toBe("Não definido");
  });

  it("normaliza linhas parciais e cria chave curta para renderização", () => {
    const row: Partial<AprFormRiskRow> = {
      atividade_processo: "Montagem de andaime",
      condicao_perigosa: "Queda de altura",
      categoria_risco: "Crítico",
    };

    expect(normalizeRiskRow(row)).toMatchObject(row);
    expect(buildRiskRowKey(row)).toBe("Montagem d-Queda de a-Crítico");
  });

  it("mapeia item persistido da API para a estrutura do formulário", () => {
    const row = mapPersistedRiskItemToFormRow({
      id: "risk-1",
      apr_id: "apr-1",
      atividade: "Içamento",
      etapa: "Preparação",
      agente_ambiental: "Carga suspensa",
      condicao_perigosa: "Ruptura de cinta",
      fonte_circunstancia: "Talha e cinta",
      lesao: "Esmagamento",
      probabilidade: 2,
      severidade: 5,
      score_risco: 10,
      categoria_risco: "Crítico",
      prioridade: "Prioridade máxima",
      medidas_prevencao: "Isolar área",
      epc: "Barreira física",
      epi: "Capacete",
      permissao_trabalho: "PT içamento",
      normas_relacionadas: "NR-11",
      hierarquia_controle: null,
      residual_probabilidade: null,
      residual_severidade: null,
      residual_score: null,
      residual_categoria: null,
      responsavel: "TST",
      prazo: "2026-05-22",
      status_acao: "Aberta",
      ordem: 1,
      created_at: "2026-05-22T00:00:00.000Z",
      updated_at: "2026-05-22T00:00:00.000Z",
    });

    expect(row).toMatchObject({
      atividade_processo: "Içamento",
      fontes_circunstancias: "Talha e cinta",
      possiveis_lesoes: "Esmagamento",
      probabilidade: "2",
      severidade: "5",
      medidas_prevencao: "Isolar área",
    });
  });
});
