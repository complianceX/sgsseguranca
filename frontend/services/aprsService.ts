import api from '@/lib/api';
import { AxiosResponse } from 'axios';
import { Activity } from './activitiesService';
import { Risk } from './risksService';
import { Epi } from './episService';
import { Tool } from './toolsService';
import { Machine } from './machinesService';
import { User } from './usersService';

import { Site } from './sitesService';
import { Company } from './companiesService';
import { fetchAllPages, PaginatedResponse } from './pagination';

export interface Apr {
  id: string;
  numero: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  status: 'Pendente' | 'Aprovada' | 'Cancelada' | 'Encerrada';
  is_modelo?: boolean;
  is_modelo_padrao?: boolean;
  itens_risco?: Array<Record<string, string>>;
  probability?: number;
  severity?: number;
  exposure?: number;
  initial_risk?: number;
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  company_id: string;
  company?: Company;
  site_id: string;
  site?: Site;
  elaborador_id: string;
  elaborador?: User;
  activities: Activity[];
  risks: Risk[];
  epis: Epi[];
  tools: Tool[];
  machines: Machine[];
  participants: User[];
  auditado_por_id?: string;
  auditado_por?: User;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  versao?: number;
  parent_apr_id?: string;
  aprovado_por_id?: string;
  aprovado_por?: User;
  aprovado_em?: string;
  classificacao_resumo?: {
    total: number;
    aceitavel: number;
    atencao: number;
    substancial: number;
    critico: number;
  };
  risk_items?: Array<{
    id: string;
    apr_id: string;
    atividade?: string;
    agente_ambiental?: string;
    condicao_perigosa?: string;
    fonte_circunstancia?: string;
    lesao?: string;
    probabilidade?: number;
    severidade?: number;
    score_risco?: number;
    categoria_risco?: string;
    prioridade?: string;
    medidas_prevencao?: string;
    ordem: number;
    created_at: string;
    updated_at: string;
  }>;
  risk_evidences?: Array<{
    id: string;
    apr_id: string;
    apr_risk_item_id: string;
    uploaded_by_id?: string;
    file_key: string;
    original_name?: string;
    mime_type: string;
    file_size_bytes: number;
    hash_sha256: string;
    watermarked_file_key?: string;
    watermarked_hash_sha256?: string;
    watermark_text?: string;
    captured_at?: string;
    uploaded_at: string;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    device_id?: string;
    ip_address?: string;
    exif_datetime?: string;
    integrity_flags?: Record<string, unknown>;
    url?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface CreateAprDto {
  numero: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  status?: 'Pendente' | 'Aprovada' | 'Cancelada' | 'Encerrada';
  is_modelo?: boolean;
  is_modelo_padrao?: boolean;
  itens_risco?: Array<Record<string, string>>;
  probability?: number;
  severity?: number;
  exposure?: number;
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  company_id: string;
  site_id: string;
  elaborador_id: string;
  activities?: string[];
  risks?: string[];
  epis?: string[];
  tools?: string[];
  machines?: string[];
  participants?: string[];
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
}

export const aprsService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const response = await api.get<PaginatedResponse<Apr>>('/aprs', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) => aprsService.findPaginated({ page, limit }),
      limit: 100,
      maxPages: 20,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Apr>(`/aprs/${id}`);
    return response.data;
  },

  create: async (data: CreateAprDto) => {
    const response = await api.post<Apr>('/aprs', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateAprDto>) => {
    const response = await api.patch<Apr>(`/aprs/${id}`, data);
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/aprs/${id}/file`, formData, {
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
    }>(`/aprs/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/aprs/files/list', { params: filters });
    return response.data;
  },

  finalize: async (id: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/finalize`);
    return response.data;
  },

  approve: async (id: string, reason?: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/approve`, { reason });
    return response.data;
  },

  reject: async (id: string, reason: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/reject`, { reason });
    return response.data;
  },

  createNewVersion: async (id: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/new-version`);
    return response.data;
  },

  getLogs: async (id: string) => {
    const response = await api.get<
      Array<{
        id: string;
        apr_id: string;
        usuario_id?: string;
        acao: string;
        metadata?: Record<string, unknown>;
        data_hora: string;
      }>
    >(`/aprs/${id}/logs`);
    return response.data;
  },

  getAnalyticsOverview: async () => {
    const response = await api.get<{
      totalAprs: number;
      aprovadas: number;
      pendentes: number;
      riscosCriticos: number;
      mediaScoreRisco: number;
    }>('/aprs/analytics/overview');
    return response.data;
  },

  getVersionHistory: async (id: string) => {
    const response = await api.get<
      Array<{
        id: string;
        numero: string;
        versao: number;
        status: string;
        parent_apr_id?: string;
        aprovado_em?: string;
        updated_at: string;
        classificacao_resumo?: {
          total: number;
          aceitavel: number;
          atencao: number;
          substancial: number;
          critico: number;
        };
      }>
    >(`/aprs/${id}/versions`);
    return response.data;
  },

  compareVersions: async (baseId: string, targetId: string) => {
    const response = await api.get<{
      base: { id: string; numero: string; versao: number };
      target: { id: string; numero: string; versao: number };
      summary: {
        totalBase: number;
        totalTarget: number;
        added: number;
        removed: number;
        changed: number;
      };
      added: Array<Record<string, string>>;
      removed: Array<Record<string, string>>;
      changed: Array<{
        index: number;
        before: Record<string, string>;
        after: Record<string, string>;
        changedFields: string[];
      }>;
    }>(`/aprs/${baseId}/compare/${targetId}`);
    return response.data;
  },

  uploadRiskEvidence: async (
    aprId: string,
    riskItemId: string,
    file: File,
    metadata?: {
      captured_at?: string;
      latitude?: number;
      longitude?: number;
      accuracy_m?: number;
      device_id?: string;
      exif_datetime?: string;
    },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.captured_at) formData.append('captured_at', metadata.captured_at);
    if (typeof metadata?.latitude === 'number')
      formData.append('latitude', String(metadata.latitude));
    if (typeof metadata?.longitude === 'number')
      formData.append('longitude', String(metadata.longitude));
    if (typeof metadata?.accuracy_m === 'number')
      formData.append('accuracy_m', String(metadata.accuracy_m));
    if (metadata?.device_id) formData.append('device_id', metadata.device_id);
    if (metadata?.exif_datetime)
      formData.append('exif_datetime', metadata.exif_datetime);

    const response = await api.post(
      `/aprs/${aprId}/risk-items/${riskItemId}/evidence`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },

  listAprEvidences: async (aprId: string) => {
    const response = await api.get<
      Array<{
        id: string;
        apr_id: string;
        apr_risk_item_id: string;
        uploaded_by_id?: string;
        file_key: string;
        original_name?: string;
        mime_type: string;
        file_size_bytes: number;
        hash_sha256: string;
        watermarked_file_key?: string;
        watermarked_hash_sha256?: string;
        watermark_text?: string;
        captured_at?: string;
        uploaded_at: string;
        latitude?: number;
        longitude?: number;
        accuracy_m?: number;
        device_id?: string;
        ip_address?: string;
        exif_datetime?: string;
        integrity_flags?: Record<string, unknown>;
        url?: string;
        watermarked_url?: string;
      }>
    >(`/aprs/${aprId}/evidence`);
    return response.data;
  },

  verifyEvidenceHash: async (hash: string) => {
    const response = await api.get<{
      verified: boolean;
      matchedIn?: 'original' | 'watermarked';
      message?: string;
      evidence?: {
        id: string;
        apr_id: string;
        apr_numero?: string | null;
        apr_versao?: number | null;
        risk_item_id: string;
        risk_item_ordem?: number | null;
        uploaded_at: string;
        uploaded_by_id?: string | null;
        uploaded_by_name?: string | null;
        original_hash: string;
        watermarked_hash?: string | null;
        integrity_flags?: Record<string, unknown>;
      };
    }>('/aprs/evidence/verify', { params: { hash } });
    return response.data;
  },

  getEvidenceCustodyReport: async (aprId: string, riskItemId?: string) => {
    const response = await api.get<{
      report_generated_at: string;
      apr: { id: string; numero: string; versao: number; status: string };
      scope: {
        apr_id: string;
        apr_risk_item_id: string | null;
        evidence_count: number;
      };
      chain_digest_sha256: string;
      timeline: Array<{
        evidence_id: string;
        timestamp: string;
        event: 'EVIDENCE_STORED';
        actor_id?: string | null;
        actor_name?: string | null;
        risk_item_id: string;
        risk_item_ordem?: number | null;
        original_hash: string;
        watermarked_hash?: string | null;
        file_key: string;
        watermarked_file_key?: string | null;
        integrity_flags?: Record<string, unknown>;
      }>;
    }>(`/aprs/${aprId}/evidence/report`, {
      params: riskItemId ? { riskItemId } : undefined,
    });
    return response.data;
  },

  downloadEvidenceCustodyPdf: async (aprId: string, riskItemId?: string) => {
    const response = await api.get<
      Blob,
      AxiosResponse<Blob>
    >(`/aprs/${aprId}/evidence/report/pdf`, {
      params: riskItemId ? { riskItemId } : undefined,
      responseType: 'blob',
    });
    return response;
  },

  delete: async (id: string) => {
    await api.delete(`/aprs/${id}`);
  },
};
