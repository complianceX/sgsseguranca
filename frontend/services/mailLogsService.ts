import api from '@/lib/api';

export interface MailLogItem {
  id: string;
  company_id?: string | null;
  user_id?: string | null;
  to: string;
  subject: string;
  filename: string;
  message_id?: string | null;
  accepted?: string[] | null;
  rejected?: string[] | null;
  provider_response?: string | null;
  using_test_account: boolean;
  status: string;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MailLogsResponse {
  items: MailLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const mailLogsService = {
  list: async (opts?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<MailLogsResponse> => {
    const response = await api.get<MailLogsResponse>('/mail/logs', {
      params: {
        page: opts?.page ?? 1,
        pageSize: opts?.pageSize ?? 8,
        ...(opts?.status ? { status: opts.status } : {}),
      },
    });
    return response.data;
  },

  exportCsv: async (): Promise<Blob> => {
    const response = await api.get('/mail/logs/export', {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};
