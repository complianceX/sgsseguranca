"use client";

import * as z from "zod";

export const ddsSchema = z.object({
  tema: z.string().min(5, "O tema deve ter pelo menos 5 caracteres"),
  conteudo: z.string().optional(),
  data: z.string(),
  company_id: z.string().min(1, "Selecione uma empresa"),
  site_id: z.string().min(1, "Selecione um site"),
  facilitador_id: z.string().min(1, "Selecione um facilitador"),
  participants: z
    .array(z.string())
    .min(1, "Selecione pelo menos um participante"),
});

export type DdsFormData = z.infer<typeof ddsSchema>;
