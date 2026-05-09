import api from '@/lib/api';
import { PaginatedResponse } from './pagination';

export const EXPENSE_CATEGORIES = [
  'transporte',
  'alimentacao',
  'hospedagem',
  'combustivel',
  'pedagio',
  'impressao',
  'materiais',
  'outros',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseReportStatus = 'aberta' | 'fechada' | 'cancelada';
export type ExpenseAdvanceMethod =
  | 'pix'
  | 'transferencia'
  | 'dinheiro'
  | 'cartao'
  | 'outro';

export interface ExpenseTotals {
  totalAdvances: string;
  totalExpenses: string;
  balance: string;
  totalsByCategory: Record<ExpenseCategory, string>;
}

export interface ExpenseAdvance {
  id: string;
  report_id: string;
  amount: string;
  advance_date: string;
  method: ExpenseAdvanceMethod;
  description?: string | null;
  created_at: string;
}

export interface ExpenseItem {
  id: string;
  report_id: string;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  description: string;
  vendor?: string | null;
  location?: string | null;
  receipt_original_name: string;
  receipt_mime_type: string;
  created_at: string;
}

export interface ExpenseReport {
  id: string;
  period_start: string;
  period_end: string;
  status: ExpenseReportStatus;
  notes?: string | null;
  total_advances: string;
  total_expenses: string;
  balance: string;
  company_id: string;
  site_id: string;
  responsible_id: string;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  site?: { id: string; nome: string; cidade?: string; estado?: string };
  responsible?: { id: string; nome: string };
  closed_by?: { id: string; nome: string } | null;
  advances?: ExpenseAdvance[];
  items?: ExpenseItem[];
  totals: ExpenseTotals;
}

export interface CreateExpenseReportPayload {
  period_start: string;
  period_end: string;
  site_id: string;
  responsible_id: string;
  notes?: string;
}

export interface CreateExpenseAdvancePayload {
  amount: number;
  advance_date: string;
  method: ExpenseAdvanceMethod;
  description?: string;
}

export interface CreateExpenseItemPayload {
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  description: string;
  vendor?: string;
  location?: string;
  file: File;
}

export interface ExpenseReceiptAccess {
  itemId: string;
  originalName: string;
  mimeType: string;
  url: string;
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  transporte: 'Transporte',
  alimentacao: 'Alimentação',
  hospedagem: 'Hospedagem',
  combustivel: 'Combustível',
  pedagio: 'Pedágio',
  impressao: 'Impressão',
  materiais: 'Materiais',
  outros: 'Outros',
};

export const EXPENSE_STATUS_LABEL: Record<ExpenseReportStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
};

export const EXPENSE_ADVANCE_METHOD_LABEL: Record<ExpenseAdvanceMethod, string> = {
  pix: 'PIX',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  outro: 'Outro',
};

export const expensesService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: ExpenseReportStatus;
    period_start?: string;
    period_end?: string;
  }): Promise<PaginatedResponse<ExpenseReport>> => {
    const response = await api.get<PaginatedResponse<ExpenseReport>>(
      '/expenses/reports',
      {
        params: {
          page: opts?.page ?? 1,
          limit: opts?.limit ?? 20,
          site_id: opts?.site_id || undefined,
          status: opts?.status || undefined,
          period_start: opts?.period_start || undefined,
          period_end: opts?.period_end || undefined,
        },
      },
    );
    return response.data;
  },

  findOne: async (id: string): Promise<ExpenseReport> => {
    const response = await api.get<ExpenseReport>(`/expenses/reports/${id}`);
    return response.data;
  },

  create: async (data: CreateExpenseReportPayload): Promise<ExpenseReport> => {
    const response = await api.post<ExpenseReport>('/expenses/reports', data);
    return response.data;
  },

  update: async (
    id: string,
    data: Partial<CreateExpenseReportPayload>,
  ): Promise<ExpenseReport> => {
    const response = await api.patch<ExpenseReport>(
      `/expenses/reports/${id}`,
      data,
    );
    return response.data;
  },

  addAdvance: async (
    id: string,
    data: CreateExpenseAdvancePayload,
  ): Promise<ExpenseReport> => {
    const response = await api.post<ExpenseReport>(
      `/expenses/reports/${id}/advances`,
      data,
    );
    return response.data;
  },

  addItem: async (
    id: string,
    data: CreateExpenseItemPayload,
  ): Promise<ExpenseReport> => {
    const formData = new FormData();
    formData.append('category', data.category);
    formData.append('amount', String(data.amount));
    formData.append('expense_date', data.expense_date);
    formData.append('description', data.description);
    if (data.vendor) formData.append('vendor', data.vendor);
    if (data.location) formData.append('location', data.location);
    formData.append('file', data.file);

    const response = await api.post<ExpenseReport>(
      `/expenses/reports/${id}/items`,
      formData,
    );
    return response.data;
  },

  removeItem: async (id: string, itemId: string): Promise<ExpenseReport> => {
    const response = await api.delete<ExpenseReport>(
      `/expenses/reports/${id}/items/${itemId}`,
    );
    return response.data;
  },

  close: async (id: string): Promise<ExpenseReport> => {
    const response = await api.post<ExpenseReport>(
      `/expenses/reports/${id}/close`,
    );
    return response.data;
  },

  getReceiptAccess: async (
    id: string,
    itemId: string,
  ): Promise<ExpenseReceiptAccess> => {
    const response = await api.get<ExpenseReceiptAccess>(
      `/expenses/reports/${id}/items/${itemId}/receipt`,
    );
    return response.data;
  },

  exportReport: async (id: string): Promise<Blob> => {
    const response = await api.get(`/expenses/reports/${id}/export`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
