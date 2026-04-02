import * as z from "zod";

const checklistStatusSchema = z.enum([
  "ok",
  "nok",
  "na",
  "sim",
  "nao",
  "Pendente",
  "Conforme",
  "Não Conforme",
]);

export const checklistSubitemSchema = z.object({
  id: z.string().optional(),
  texto: z.string().min(1, "O subitem é obrigatório"),
  ordem: z.number().optional(),
  status: checklistStatusSchema.optional(),
  resposta: z.any().optional(),
  observacao: z.string().optional(),
});

export const checklistItemSchema = z.object({
  id: z.string().optional(),
  item: z.string().min(1, "O item de verificação é obrigatório"),
  status: checklistStatusSchema,
  tipo_resposta: z.enum([
    "sim_nao",
    "conforme",
    "texto",
    "foto",
    "sim_nao_na",
  ]),
  obrigatorio: z.boolean(),
  peso: z.number(),
  resposta: z.any().optional(),
  observacao: z.string().optional(),
  fotos: z.array(z.string()).optional(),
  topico_id: z.string().min(1, "Vincule o item a um tópico"),
  topico_titulo: z.string().optional(),
  ordem_topico: z.number().optional(),
  ordem_item: z.number().optional(),
  subitens: z.array(checklistSubitemSchema).optional(),
});

export const checklistTopicSchema = z.object({
  id: z.string().optional(),
  titulo: z.string().min(1, "O nome do tópico principal é obrigatório"),
  ordem: z.number().optional(),
});

export const checklistSchema = z
  .object({
    titulo: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
    descricao: z.string().optional(),
    equipamento: z.string().optional(),
    maquina: z.string().optional(),
    foto_equipamento: z.string().optional(),
    data: z.string(),
    status: z.enum(["Conforme", "Não Conforme", "Pendente"]),
    company_id: z.string().min(1, "Selecione uma empresa"),
    site_id: z.string().optional(),
    inspetor_id: z.string().optional(),

    categoria: z.string().optional(),
    periodicidade: z.string().optional(),
    nivel_risco_padrao: z.string().optional(),
    ativo: z.boolean().optional(),

    topicos: z
      .array(checklistTopicSchema)
      .min(1, "Adicione pelo menos um tópico principal"),
    itens: z
      .array(checklistItemSchema)
      .min(1, "Adicione pelo menos um item ao checklist"),

    is_modelo: z.boolean().optional(),
    auditado_por_id: z.string().optional(),
    data_auditoria: z.string().optional(),
    resultado_auditoria: z.string().optional(),
    notas_auditoria: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.is_modelo) {
      if (!value.site_id?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["site_id"],
          message: "Selecione uma obra/setor.",
        });
      }

      if (!value.inspetor_id?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inspetor_id"],
          message: "Selecione um inspetor.",
        });
      }
    }

    const topicIds = new Set(
      value.topicos
        .map((topico) => topico.id)
        .filter((current): current is string => Boolean(current)),
    );
    value.itens.forEach((item, index) => {
      if (item.topico_id && topicIds.size > 0 && !topicIds.has(item.topico_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["itens", index, "topico_id"],
          message: "O item está vinculado a um tópico inexistente.",
        });
      }
    });

    const itemsByTopic = new Map<string, number>();
    value.itens.forEach((item) => {
      if (!item.topico_id) return;
      itemsByTopic.set(item.topico_id, (itemsByTopic.get(item.topico_id) || 0) + 1);
    });

    value.topicos.forEach((topico, index) => {
      if (!topico.id) return;
      if ((itemsByTopic.get(topico.id) || 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topicos", index, "titulo"],
          message: "Cada tópico principal precisa ter ao menos um item de verificação.",
        });
      }
    });
  });

export type ChecklistFormData = z.infer<typeof checklistSchema>;
export type ChecklistTopicForm = ChecklistFormData["topicos"][number];
export type ChecklistItemForm = ChecklistFormData["itens"][number];
export type ChecklistSubitemForm = NonNullable<
  ChecklistItemForm["subitens"]
>[number];
