import * as z from 'zod';

export const didSchema = z.object({
  titulo: z.string().min(5, 'Informe um título com pelo menos 5 caracteres.'),
  descricao: z.string().optional(),
  data: z.string().min(1, 'Informe a data do diálogo.'),
  turno: z.string().optional(),
  frente_trabalho: z.string().optional(),
  atividade_principal: z
    .string()
    .min(5, 'Informe a atividade principal do dia.'),
  atividades_planejadas: z
    .string()
    .min(10, 'Detalhe as atividades planejadas.'),
  riscos_operacionais: z
    .string()
    .min(10, 'Detalhe os riscos operacionais do dia.'),
  controles_planejados: z
    .string()
    .min(10, 'Detalhe os controles planejados.'),
  epi_epc_aplicaveis: z.string().optional(),
  observacoes: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa.'),
  site_id: z.string().min(1, 'Selecione um site.'),
  responsavel_id: z.string().min(1, 'Selecione o responsável.'),
  participants: z
    .array(z.string())
    .min(1, 'Selecione pelo menos um participante.'),
});

export type DidFormData = z.infer<typeof didSchema>;

