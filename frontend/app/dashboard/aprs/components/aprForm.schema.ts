"use client";

import * as z from "zod";

const MAX_APR_DAYS = 1825; // 5 anos

export const aprSchema = z.object({
  // Campo interno: indica que o usuário anexou uma APR já preenchida e assinada (PDF).
  // Usado somente para validação/UX do wizard; não deve ser enviado para a API.
  pdf_signed: z.boolean().optional(),
  numero: z.string().min(1, "O número é obrigatório"),
  titulo: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
  descricao: z.string().optional(),
  tipo_atividade: z.string().optional(),
  frente_trabalho: z.string().optional(),
  area_risco: z.string().optional(),
  turno: z.string().optional(),
  local_execucao_detalhado: z.string().optional(),
  responsavel_tecnico_nome: z.string().optional(),
  responsavel_tecnico_registro: z.string().optional(),
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
        etapa: z.string().optional(),
        agente_ambiental: z.string().optional(),
        condicao_perigosa: z.string().optional(),
        fontes_circunstancias: z.string().optional(),
        possiveis_lesoes: z.string().optional(),
        probabilidade: z.string().optional(),
        severidade: z.string().optional(),
        categoria_risco: z.string().optional(),
        medidas_prevencao: z.string().optional(),
        epc: z.string().optional(),
        epi: z.string().optional(),
        permissao_trabalho: z.string().optional(),
        normas_relacionadas: z.string().optional(),
        hierarquia_controle: z.string().optional(),
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
  if (!data.data_inicio || !data.data_fim) return;

  const start = new Date(data.data_inicio);
  const end = new Date(data.data_fim);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

  if (end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data de término não pode ser anterior à data de início.",
      path: ["data_fim"],
    });
    return;
  }

  const daysDiff = (end.getTime() - start.getTime()) / 86_400_000;
  if (daysDiff > MAX_APR_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `O período da APR não pode exceder ${MAX_APR_DAYS} dias (5 anos).`,
      path: ["data_fim"],
    });
  }
});

export type AprFormData = z.infer<typeof aprSchema>;
export type AprRiskRowData = NonNullable<AprFormData["itens_risco"]>[number];
