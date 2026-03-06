import api from '@/lib/api';

export interface RiscoIdentificado {
  risco: string;
  medida_controle: string;
}

export interface EpiNecessario {
  nome: string;
  ca: string;
}

export interface ServiceOrder {
  id: string;
  numero: string;
  titulo: string;
  descricao_atividades: string;
  riscos_identificados: RiscoIdentificado[] | null;
  epis_necessarios: EpiNecessario[] | null;
  responsabilidades: string | null;
  status: string;
  data_emissao: string;
  data_inicio: string | null;
  data_fim_previsto: string | null;
  responsavel_id: string | null;
  site_id: string | null;
  company_id: string;
  responsavel?: { id: string; nome: string };
  site?: { id: string; nome: string };
  created_at: string;
  updated_at: string;
}

export interface ServiceOrderPage {
  data: ServiceOrder[];
  total: number;
  page: number;
  lastPage: number;
}

export const OS_STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const OS_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-blue-100 text-blue-800',
  concluido: 'bg-green-100 text-green-800',
  cancelado: 'bg-gray-100 text-gray-600',
};

export const OS_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ativo: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

export const serviceOrdersService = {
  async findPaginated(params?: {
    page?: number;
    limit?: number;
    status?: string;
    site_id?: string;
  }): Promise<ServiceOrderPage> {
    const res = await api.get('/service-orders', { params });
    return res.data;
  },

  async findOne(id: string): Promise<ServiceOrder> {
    const res = await api.get(`/service-orders/${id}`);
    return res.data;
  },

  async create(data: Partial<ServiceOrder>): Promise<ServiceOrder> {
    const res = await api.post('/service-orders', data);
    return res.data;
  },

  async update(id: string, data: Partial<ServiceOrder>): Promise<ServiceOrder> {
    const res = await api.patch(`/service-orders/${id}`, data);
    return res.data;
  },

  async updateStatus(id: string, status: string): Promise<ServiceOrder> {
    const res = await api.patch(`/service-orders/${id}/status`, { status });
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/service-orders/${id}`);
  },
};
