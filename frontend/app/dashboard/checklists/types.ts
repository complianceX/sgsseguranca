import * as z from 'zod';

export const checklistSchema = z.object({
  titulo: z.string().min(5, 'O título deve ter pelo menos 5 caracteres'),
  descricao: z.string().optional(),
  equipamento: z.string().optional(),
  maquina: z.string().optional(),
  foto_equipamento: z.string().optional(),
  data: z.string(),
  status: z.enum(['Conforme', 'Não Conforme', 'Pendente']),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  site_id: z.string().optional(),
  inspetor_id: z.string().optional(),
  
  categoria: z.string().optional(),
  periodicidade: z.string().optional(),
  nivel_risco_padrao: z.string().optional(),
  ativo: z.boolean().optional(),

  itens: z.array(z.object({
    id: z.string().optional(),
    item: z.string().min(1, 'A pergunta é obrigatória'),
    status: z.enum(['ok', 'nok', 'na', 'sim', 'nao']),
    tipo_resposta: z.enum(['sim_nao', 'conforme', 'texto', 'foto', 'sim_nao_na']),
    obrigatorio: z.boolean(),
    peso: z.number(),
    resposta: z.any().optional(),
    observacao: z.string().optional(),
    fotos: z.array(z.string()).optional(),
  })).min(1, 'Adicione pelo menos um item ao checklist'),
  
  is_modelo: z.boolean().optional(),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
});

export type ChecklistFormData = z.infer<typeof checklistSchema>;
export type ChecklistItemForm = ChecklistFormData['itens'][number];
