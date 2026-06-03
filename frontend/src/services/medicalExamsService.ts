import api from '@/lib/api';
import { fetchAllPages } from './pagination';
import type { CursorPaginatedResponse, PaginatedResponse } from './pagination';

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

export interface MedicalExamLookupUser {
  id: string;
  nome: string;
  funcao: string;
  role: 'admin' | 'manager' | 'user';
  company_id: string;
  site_id?: string;
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
  apto: 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
  inapto: 'bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]',
  apto_com_restricoes: 'bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
};

export const medicalExamsService = {
  async findPaginated(params?: {
    page?: number;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
    companyId?: string;
  }): Promise<MedicalExamPage> {
    const { companyId, ...query } = params ?? {};
    const res = await api.get('/medical-exams', {
      params: query,
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async findLookupUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<MedicalExamLookupUser>> {
    const { companyId, ...query } = params ?? {};
    const res = await api.get<PaginatedResponse<MedicalExamLookupUser>>(
      '/medical-exams/lookups/users',
      {
        params: query,
        ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
      },
    );
    return res.data;
  },

  async findByCursor(params?: {
    cursor?: string;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
    companyId?: string;
  }): Promise<CursorPaginatedResponse<MedicalExam>> {
    const { companyId, ...query } = params ?? {};
    const res = await api.get('/medical-exams', {
      params: {
        cursor: query.cursor,
        limit: query.limit ?? 20,
        ...(query.tipo_exame ? { tipo_exame: query.tipo_exame } : {}),
        ...(query.resultado ? { resultado: query.resultado } : {}),
        ...(query.user_id ? { user_id: query.user_id } : {}),
      },
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async findAllForExport(companyId?: string): Promise<MedicalExam[]> {
    const res = await api.get('/medical-exams/export/all', {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async findOne(id: string, companyId?: string): Promise<MedicalExam> {
    const res = await api.get(`/medical-exams/${id}`, {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async create(
    data: Partial<MedicalExam>,
    companyId?: string,
  ): Promise<MedicalExam> {
    const res = await api.post('/medical-exams', data, {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async update(
    id: string,
    data: Partial<MedicalExam>,
    companyId?: string,
  ): Promise<MedicalExam> {
    const res = await api.patch(`/medical-exams/${id}`, data, {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async delete(id: string, companyId?: string): Promise<void> {
    await api.delete(`/medical-exams/${id}`, {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
  },

  async getExpirySummary(companyId?: string): Promise<MedicalExamExpirySummary> {
    const res = await api.get('/medical-exams/expiry/summary', {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
    return res.data;
  },

  async findAllLookupUsers(
    search?: string,
    companyId?: string,
  ): Promise<MedicalExamLookupUser[]> {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        medicalExamsService.findLookupUsers({ page, limit, search, companyId }),
      limit: 100,
      maxPages: 50,
      cacheKey: `GET:/medical-exams/lookups/users?page=*&limit=100&search=${
        search || 'all'
      }`,
    });
  },
};
