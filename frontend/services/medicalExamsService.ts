import api from '@/lib/api';

export interface MedicalExam {
  id: string;
  tipo_exame: string;
  resultado: string;
  data_realizacao: string;
  data_vencimento: string | null;
  medico_responsavel: string | null;
  crm_medico: string | null;
  observacoes: string | null;
  user_id: string;
  company_id: string;
  user?: { id: string; nome: string; cpf?: string };
  created_at: string;
  updated_at: string;
}

export interface MedicalExamExpirySummary {
  total: number;
  expired: number;
  expiringSoon: number;
  valid: number;
}

export interface MedicalExamPage {
  data: MedicalExam[];
  total: number;
  page: number;
  lastPage: number;
}

export const TIPO_EXAME_LABEL: Record<string, string> = {
  admissional: 'Admissional',
  periodico: 'Periódico',
  retorno: 'Retorno ao Trabalho',
  demissional: 'Demissional',
  mudanca_funcao: 'Mudança de Função',
};

export const RESULTADO_LABEL: Record<string, string> = {
  apto: 'Apto',
  inapto: 'Inapto',
  apto_com_restricoes: 'Apto c/ Restrições',
};

export const RESULTADO_COLORS: Record<string, string> = {
  apto: 'bg-green-100 text-green-800',
  inapto: 'bg-red-100 text-red-800',
  apto_com_restricoes: 'bg-yellow-100 text-yellow-800',
};

export const medicalExamsService = {
  async findPaginated(params?: {
    page?: number;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<MedicalExamPage> {
    const res = await api.get('/medical-exams', { params });
    return res.data;
  },

  async findOne(id: string): Promise<MedicalExam> {
    const res = await api.get(`/medical-exams/${id}`);
    return res.data;
  },

  async create(data: Partial<MedicalExam>): Promise<MedicalExam> {
    const res = await api.post('/medical-exams', data);
    return res.data;
  },

  async update(id: string, data: Partial<MedicalExam>): Promise<MedicalExam> {
    const res = await api.patch(`/medical-exams/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/medical-exams/${id}`);
  },

  async getExpirySummary(): Promise<MedicalExamExpirySummary> {
    const res = await api.get('/medical-exams/expiry/summary');
    return res.data;
  },
};
