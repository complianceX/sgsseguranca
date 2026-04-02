import {
  buildChecklistFormHierarchy,
  buildChecklistRequestPayload,
  getChecklistTopicsWithoutItems,
} from "./form-serialization";
import { normalizeChecklistHierarchy } from "./hierarchy";
import { checklistSchema, type ChecklistFormData } from "./types";

describe("checklists form serialization", () => {
  it("serializa topicos com itens aninhados e itens achatados no payload", () => {
    const payload = buildChecklistRequestPayload(
      {
        titulo: "Checklist operacional",
        descricao: "Teste",
        equipamento: "Detector",
        maquina: "",
        foto_equipamento: "",
        data: "2026-04-02",
        status: "Pendente",
        company_id: "company-1",
        site_id: "site-1",
        inspetor_id: "user-1",
        categoria: "SST",
        periodicidade: "Diário",
        nivel_risco_padrao: "Médio",
        ativo: true,
        is_modelo: true,
        auditado_por_id: "",
        data_auditoria: "",
        resultado_auditoria: "",
        notas_auditoria: "",
        topicos: [
          { id: "topic-1", titulo: "Área de vivência", ordem: 1 },
          { id: "topic-2", titulo: "Instalações elétricas", ordem: 2 },
        ],
        itens: [
          {
            id: "item-1",
            item: "A área possui condições adequadas?",
            status: "sim",
            tipo_resposta: "sim_nao_na",
            obrigatorio: true,
            peso: 1,
            observacao: "",
            resposta: "",
            fotos: [],
            topico_id: "topic-1",
            topico_titulo: "Área de vivência",
            ordem_topico: 1,
            ordem_item: 1,
            subitens: [
              {
                id: "sub-1",
                texto: "Cobertura adequada",
                ordem: 1,
                status: "nao",
                observacao: "Sem cobertura",
              },
            ],
          },
        ],
      },
      {
        checklistMode: "tool",
        isTemplateMode: true,
      },
    );

    expect(payload.topicos).toHaveLength(2);
    expect(payload.topicos[0].itens).toHaveLength(1);
    expect(payload.topicos[0].itens[0].subitens?.[0]).toEqual({
      id: "sub-1",
      texto: "Cobertura adequada",
      ordem: 1,
      status: "nao",
      resposta: undefined,
      observacao: "Sem cobertura",
    });
    expect(payload.topicos[0].itens[0].status).toBe("nao");
    expect(payload.topicos[1].itens).toHaveLength(0);
    expect(payload.itens).toHaveLength(1);
  });

  it("normaliza status legados e reseta estado de execução ao carregar modelo", () => {
    const normalized = buildChecklistFormHierarchy(
      [
        {
          id: "topic-1",
          titulo: "Área de vivência",
          ordem: 1,
          itens: [
            {
              id: "item-1",
              item: "A área está coberta?",
              tipo_resposta: "sim_nao_na",
              status: "nao",
              observacao: "Pendência antiga",
              fotos: ["data:image/png;base64,AAAA"],
            },
          ],
        },
      ],
      [],
      { resetExecutionState: true },
    );

    expect(normalized.topicos[0].titulo).toBe("Área de vivência");
    expect(normalized.itens[0].status).toBe("sim");
    expect(normalized.itens[0].observacao).toBe("");
    expect(normalized.itens[0].fotos).toEqual([]);
    expect(normalized.itens[0].subitens).toEqual([]);
  });

  it("propaga o status do item para subitens legados sem resposta propria", () => {
    const normalized = buildChecklistFormHierarchy(
      [
        {
          id: "topic-1",
          titulo: "Área de vivência",
          ordem: 1,
          itens: [
            {
              id: "item-1",
              item: "A área está coberta?",
              tipo_resposta: "sim_nao_na",
              status: "nao",
              subitens: [
                { id: "sub-1", texto: "Cobertura adequada", ordem: 1 },
                { id: "sub-2", texto: "Ventilação adequada", ordem: 2 },
              ],
            },
          ],
        },
      ],
      [],
    );

    expect(normalized.itens[0].subitens?.map((subitem) => subitem.status)).toEqual([
      "nao",
      "nao",
    ]);
  });

  it("identifica topico sem item e schema bloqueia submit", () => {
    const emptyTopics = getChecklistTopicsWithoutItems(
      [
        { id: "topic-1", titulo: "Área de vivência", ordem: 1 },
        { id: "topic-2", titulo: "Instalações elétricas", ordem: 2 },
      ],
      [
        {
          id: "item-1",
          item: "A área está coberta?",
          status: "sim",
          tipo_resposta: "sim_nao_na",
          obrigatorio: true,
          peso: 1,
          topico_id: "topic-1",
        },
      ],
    );

    expect(emptyTopics.map((topic) => topic.titulo)).toEqual([
      "Instalações elétricas",
    ]);

    const result = checklistSchema.safeParse({
      titulo: "Checklist operacional",
      descricao: "",
      equipamento: "Detector",
      maquina: "",
      foto_equipamento: "",
      data: "2026-04-02",
      status: "Pendente",
      company_id: "company-1",
      site_id: "site-1",
      inspetor_id: "user-1",
      categoria: "SST",
      periodicidade: "Diário",
      nivel_risco_padrao: "Médio",
      ativo: true,
      is_modelo: true,
      auditado_por_id: "",
      data_auditoria: "",
      resultado_auditoria: "",
      notas_auditoria: "",
      topicos: [
        { id: "topic-1", titulo: "Área de vivência", ordem: 1 },
        { id: "topic-2", titulo: "Instalações elétricas", ordem: 2 },
      ],
      itens: [
        {
          id: "item-1",
          item: "A área está coberta?",
          status: "sim",
          tipo_resposta: "sim_nao_na",
          obrigatorio: true,
          peso: 1,
          topico_id: "topic-1",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("preserva item vazio durante a edição, mas remove esse item do payload salvo", () => {
    const editingState = normalizeChecklistHierarchy(
      {
        topicos: [{ id: "topic-1", titulo: "Área de vivência", ordem: 1 }],
        itens: [
          {
            id: "item-blank",
            item: "",
            status: "sim",
            tipo_resposta: "sim_nao_na",
            obrigatorio: true,
            peso: 1,
            topico_id: "topic-1",
            subitens: [],
          },
        ],
      },
      {
        preserveEmptyItems: true,
        preserveEmptySubitems: true,
      },
    );

    expect(editingState.itens).toHaveLength(1);
    expect(editingState.itens[0].id).toBe("item-blank");
    expect(editingState.itens[0].item).toBe("");

    const payload = buildChecklistRequestPayload(
      {
        titulo: "Checklist operacional",
        descricao: "Teste",
        equipamento: "Detector",
        maquina: "",
        foto_equipamento: "",
        data: "2026-04-02",
        status: "Pendente",
        company_id: "company-1",
        site_id: "site-1",
        inspetor_id: "user-1",
        categoria: "SST",
        periodicidade: "Diário",
        nivel_risco_padrao: "Médio",
        ativo: true,
        is_modelo: true,
        auditado_por_id: "",
        data_auditoria: "",
        resultado_auditoria: "",
        notas_auditoria: "",
        topicos: [{ id: "topic-1", titulo: "Área de vivência", ordem: 1 }],
        itens: editingState.itens as ChecklistFormData["itens"],
      },
      {
        checklistMode: "tool",
        isTemplateMode: true,
      },
    );

    expect(payload.itens).toHaveLength(0);
    expect(payload.topicos[0].itens).toHaveLength(0);
  });
});
