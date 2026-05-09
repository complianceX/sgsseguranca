import api from '@/lib/api';

export interface DocumentRegistryEntry {
  id: string;
  module: string;
  document_type: string;
  entity_id: string;
  title: string;
  document_date: string | null;
  iso_year: number;
  iso_week: number;
  original_name: string | null;
  mime_type: string | null;
  document_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRegistryPdfAccess {
  entityId: string;
  hasFinalPdf: boolean;
  availability:
    | 'ready'
    | 'registered_without_signed_url'
    | 'not_emitted';
  message: string | null;
  fileKey: string | null;
  folderPath: string | null;
  originalName: string | null;
  url: string | null;
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

  getPdfAccess: async (id: string): Promise<DocumentRegistryPdfAccess> => {
    const response = await api.get<DocumentRegistryPdfAccess>(
      `/document-registry/${id}/pdf`,
    );
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
