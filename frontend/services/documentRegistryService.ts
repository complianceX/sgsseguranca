import api from '@/lib/api';

export interface DocumentRegistryEntry {
  id: string;
  company_id: string;
  module: string;
  document_type: string;
  entity_id: string;
  title: string;
  document_date: string | null;
  iso_year: number;
  iso_week: number;
  file_key: string;
  folder_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  file_hash: string | null;
  document_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const documentRegistryService = {
  list: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
    modules?: string[];
  }) => {
    const response = await api.get<DocumentRegistryEntry[]>('/document-registry', {
      params: {
        company_id: filters?.company_id,
        year: filters?.year,
        week: filters?.week,
        modules: filters?.modules?.join(','),
      },
    });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
    modules?: string[];
  }) => {
    const response = await api.get('/document-registry/weekly-bundle', {
      params: {
        company_id: filters.company_id,
        year: filters.year,
        week: filters.week,
        modules: filters.modules?.join(','),
      },
      responseType: 'blob',
    });

    return response.data as Blob;
  },
};
