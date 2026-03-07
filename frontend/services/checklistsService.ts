import api from '@/lib/api';
import { AxiosError } from 'axios';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { enqueueOfflineMutation } from '@/lib/offline-sync';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';

export interface ChecklistItem {
  id?: string;
  item: string; // The question/label
  status: boolean | 'ok' | 'nok' | 'na' | 'sim' | 'nao';
  tipo_resposta?: 'sim_nao' | 'conforme' | 'texto' | 'foto' | 'sim_nao_na';
  obrigatorio?: boolean;
  peso?: number;
  resposta?: unknown;
  observacao?: string;
  fotos?: string[];
}

export interface Checklist {
  id: string;
  titulo: string;
  descricao?: string;
  equipamento?: string;
  maquina?: string;
  foto_equipamento?: string;
  data: string;
  status: 'Conforme' | 'Não Conforme' | 'Pendente';
  company_id: string;
  site_id: string;
  inspetor_id: string;
  itens: ChecklistItem[];
  is_modelo?: boolean;
  ativo?: boolean;
  categoria?: string;
  periodicidade?: string;
  nivel_risco_padrao?: string;
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  created_at: string;
  updated_at: string;
  site?: { nome: string };
  inspetor?: { nome: string };
  auditado_por?: { nome: string };
  company?: { razao_social: string };
}

export const checklistsService = {
  findPaginated: async (params?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const query = {
      onlyTemplates: params?.onlyTemplates ? 'true' : undefined,
      excludeTemplates: params?.excludeTemplates ? 'true' : undefined,
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
    };
    const cacheKey = `checklists.paginated.${JSON.stringify(query)}`;

    try {
      const response = await api.get<PaginatedResponse<Checklist>>('/checklists', {
        params: query,
      });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Checklist>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async (options?: { onlyTemplates?: boolean; excludeTemplates?: boolean }) => {
    const cacheKey = `checklists.all.${JSON.stringify(options || {})}`;
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) =>
          checklistsService.findPaginated({
            ...options,
            page,
            limit,
          }),
        limit: 100,
        maxPages: 50,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Checklist[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findTemplates: async () => {
    return checklistsService.findAll({ onlyTemplates: true });
  },

  findOne: async (id: string) => {
    const cacheKey = `checklists.one.${id}`;
    try {
      const response = await api.get<Checklist>(`/checklists/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Checklist>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Partial<Checklist>, companyId?: string) => {
    try {
      const response = await api.post<Checklist>('/checklists', data, {
        headers: companyId ? { 'x-company-id': companyId } : undefined,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: '/checklists',
        method: 'post',
        data,
        headers: companyId ? { 'x-company-id': companyId } : undefined,
        label: 'Checklist',
      });

      return {
        ...(data as Checklist),
        id: queued.id,
        status: ((data as Checklist)?.status || 'Pendente') as Checklist['status'],
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Checklist & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Partial<Checklist>, companyId?: string) => {
    try {
      const response = await api.patch<Checklist>(`/checklists/${id}`, data, {
        headers: companyId ? { 'x-company-id': companyId } : undefined,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/checklists/${id}`,
        method: 'patch',
        data,
        headers: companyId ? { 'x-company-id': companyId } : undefined,
        label: 'Checklist',
      });

      return {
        ...(data as Checklist),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Checklist & { offlineQueued: true };
    }
  },

  delete: async (id: string) => {
    await api.delete(`/checklists/${id}`);
  },

  sendEmail: async (id: string, to: string) => {
    await api.post(`/checklists/${id}/send-email`, { to });
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/checklists/${id}/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<{
      entityId: string;
      fileKey: string;
      folderPath: string;
      originalName: string;
      url: string;
    }>(`/checklists/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/checklists/files/list', { params: filters });
    return response.data;
  },

  // Novos métodos para fluxo de templates
  getTemplates: async (): Promise<Checklist[]> => {
    return checklistsService.findAll({ onlyTemplates: true });
  },

  getFilled: async (): Promise<Checklist[]> => {
    return checklistsService.findAll({ excludeTemplates: true });
  },

  fillFromTemplate: async (templateId: string, data: Partial<Checklist>): Promise<Checklist> => {
    const response = await api.post<Checklist>(`/checklists/fill-from-template/${templateId}`, data);
    return response.data;
  },

  savePdf: async (id: string): Promise<{ fileKey: string; folderPath: string; fileUrl: string }> => {
    const response = await api.post<{ fileKey: string; folderPath: string; fileUrl: string }>(`/checklists/${id}/save-pdf`);
    return response.data;
  },

  bootstrapActivityTemplates: async () => {
    const response = await api.post<{
      created: number;
      skipped: number;
      templates: Checklist[];
    }>('/checklists/templates/bootstrap');
    return response.data;
  },
};
