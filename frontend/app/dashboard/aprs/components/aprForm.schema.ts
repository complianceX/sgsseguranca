"use client";

import * as z from "zod";

export const aprSchema = z.object({
  // Campo interno: indica que o usuário anexou uma APR já preenchida e assinada (PDF).
  // Usado somente para validação/UX do wizard; não deve ser enviado para a API.
  pdf_signed: z.boolean().optional(),
  numero: z.string().min(1, "O número é obrigatório"),
  titulo: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
  descricao: z.string().optional(),
  data_inicio: z.string().min(1, "A data de início é obrigatória"),
  data_fim: z.string().min(1, "A data de término é obrigatória"),
  status: z.enum(["Pendente", "Aprovada", "Cancelada", "Encerrada"]),
  is_modelo: z.boolean().optional(),
  is_modelo_padrao: z.boolean().optional(),
  company_id: z.string().min(1, "Selecione uma empresa"),
  site_id: z.string().min(1, "Selecione um site"),
  elaborador_id: z.string().min(1, "Selecione um elaborador"),
  activities: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  epis: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  machines: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  itens_risco: z
    .array(
      z.object({
        atividade_processo: z.string().optional(),
        agente_ambiental: z.string().optional(),
        condicao_perigosa: z.string().optional(),
        fontes_circunstancias: z.string().optional(),
        possiveis_lesoes: z.string().optional(),
        probabilidade: z.string().optional(),
        severidade: z.string().optional(),
        categoria_risco: z.string().optional(),
        medidas_prevencao: z.string().optional(),
        responsavel: z.string().optional(),
        prazo: z.string().optional(),
        status_acao: z.string().optional(),
      }),
    )
    .optional(),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.data_inicio && data.data_fim && data.data_fim < data.data_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data de término não pode ser anterior à data de início.",
      path: ["data_fim"],
    });
  }
});

export type AprFormData = z.infer<typeof aprSchema>;
export type AprRiskRowData = NonNullable<AprFormData["itens_risco"]>[number];

