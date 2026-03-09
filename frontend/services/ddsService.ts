import api from '@/lib/api';
import { User } from './usersService';

export interface Dds {
  id: string;
  tema: string;
  conteudo?: string;
  data: string;
  company_id: string;
  site_id: string;
  facilitador_id: string;
  participants: User[];
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  is_modelo?: boolean;
  created_at: string;
  updated_at: string;
  site?: { nome: string };
  facilitador?: { nome: string };
  auditado_por?: { nome: string };
  company?: { razao_social: string };
}

export const ddsService = {
  findAll: async () => {
    const response = await api.get<Dds[]>('/dds');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Dds>(`/dds/${id}`);
    return response.data;
  },

  create: async (data: Omit<Partial<Dds>, 'participants'> & { participants?: string[] }) => {
    const response = await api.post<Dds>('/dds', data);
    return response.data;
  },

  createWithFile: async (
    data: Omit<Partial<Dds>, 'participants'> & { participants?: string[] },
    file: File,
  ) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    });
    formData.append('file', file);

    const response = await api.post('/dds/with-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/dds/${id}/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<{
      ddsId: string;
      fileKey: string;
      folderPath: string;
      originalName: string;
      url: string;
    }>(`/dds/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get<
      Array<{
        ddsId: string;
        tema: string;
        data: string;
        companyId: string;
        fileKey: string;
        folderPath: string;
        originalName: string;
      }>
    >('/dds/files/list', { params: filters });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get('/dds/files/weekly-bundle', {
      params: filters,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  update: async (id: string, data: Omit<Partial<Dds>, 'participants'> & { participants?: string[] }) => {
    const response = await api.patch<Dds>(`/dds/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/dds/${id}`);
  },
};
