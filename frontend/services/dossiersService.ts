import api from '@/lib/api';

export interface DossierAttachmentLine {
  tipo: string;
  referencia: string;
  arquivo: string;
  url: string;
}

export interface DossierGovernedDocumentLine {
  modulo:
    | "apr"
    | "pt"
    | "dds"
    | "rdo"
    | "inspection"
    | "checklist"
    | "cat"
    | "audit"
    | "nonconformity";
  modulo_label: string;
  referencia: string;
  codigo_documento: string | null;
  arquivo: string;
  disponibilidade: "ready" | "registered_without_signed_url";
  emitido_em: string | null;
}

export interface DossierPendingGovernedDocumentLine {
  modulo:
    | "apr"
    | "pt"
    | "dds"
    | "rdo"
    | "inspection"
    | "checklist"
    | "cat"
    | "audit"
    | "nonconformity";
  modulo_label: string;
  referencia: string;
  status_atual: string | null;
  pendencia: string;
}

interface DossierSummary {
  trainings: number;
  assignments: number;
  pts: number;
  cats: number;
  attachments: number;
  officialDocuments: number;
  pendingOfficialDocuments: number;
  supportingAttachments: number;
}

interface DossierTruncationDatasets {
  trainings: boolean;
  assignments: boolean;
  pts: boolean;
  cats: boolean;
  workers: boolean;
}

interface DossierTruncationInfo {
  limit: number;
  truncated: boolean;
  datasets: DossierTruncationDatasets;
}

interface DossierBaseContext {
  id: string;
  code: string;
  kind: 'employee' | 'site';
  companyId: string;
  companyName: string | null;
  generatedAt: string;
  summary: DossierSummary;
  truncation: DossierTruncationInfo;
  attachmentLines: DossierAttachmentLine[];
  governedDocumentLines: DossierGovernedDocumentLine[];
  pendingGovernedDocumentLines: DossierPendingGovernedDocumentLine[];
}

export interface EmployeeDossierContext extends DossierBaseContext {
  kind: 'employee';
  subject: {
    id: string;
    nome: string;
    funcao: string | null;
    status: boolean;
    profileName: string | null;
    siteName: string | null;
    cpf: string | null;
    updatedAt: string | null;
  };
  trainings: Array<{
    id: string;
    nome: string;
    nrCodigo: string | null;
    dataConclusao: string | null;
    dataVencimento: string | null;
    status: string;
  }>;
  assignments: Array<{
    id: string;
    epiNome: string;
    ca: string | null;
    validadeCa: string | null;
    status: string;
    entregueEm: string | null;
    devolvidoEm: string | null;
  }>;
  pts: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    responsavel: string | null;
    dataInicio: string | null;
    dataFim: string | null;
  }>;
  cats: Array<{
    id: string;
    numero: string;
    status: string;
    gravidade: string;
    dataOcorrencia: string | null;
    descricao: string | null;
  }>;
}

export interface SiteDossierContext extends DossierBaseContext {
  kind: 'site';
  subject: {
    id: string;
    nome: string;
    endereco: string | null;
    cidade: string | null;
    estado: string | null;
    status: boolean;
    updatedAt: string | null;
  };
  workers: Array<{
    id: string;
    nome: string;
    funcao: string | null;
    profileName: string | null;
    status: boolean;
  }>;
  trainings: Array<{
    id: string;
    nome: string;
    workerName: string | null;
    dataConclusao: string | null;
    dataVencimento: string | null;
    status: string;
  }>;
  assignments: Array<{
    id: string;
    workerName: string | null;
    epiNome: string;
    status: string;
    entregueEm: string | null;
    devolvidoEm: string | null;
  }>;
  pts: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    responsavel: string | null;
    dataInicio: string | null;
    dataFim: string | null;
  }>;
  cats: Array<{
    id: string;
    numero: string;
    status: string;
    gravidade: string;
    workerName: string | null;
    dataOcorrencia: string | null;
  }>;
}

export type DossierContext = EmployeeDossierContext | SiteDossierContext;

import type { GovernedPdfAccessResponse } from "@/lib/api/generated/governed-contracts.client";

export interface DossierPdfAccess extends Omit<GovernedPdfAccessResponse, 'entityId'> {
  dossierId: string;
  kind: 'employee' | 'site';
  degraded: boolean;
  fileHash: string | null;
  documentCode: string;
}

export interface DossierAttachPdfResult {
  dossierId: string;
  kind: 'employee' | 'site';
  hasFinalPdf: boolean;
  availability: 'ready' | 'registered_without_signed_url' | 'not_emitted';
  message: string;
  degraded: boolean;
  fileKey: string;
  folderPath: string;
  originalName: string;
  documentCode: string;
  fileHash: string;
}

async function openPdfUrl(url: string, fallbackFilename: string) {
  const opened = typeof window !== 'undefined' ? window.open(url, '_blank') : null;
  if (opened) {
    return;
  }

  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export const dossiersService = {
  getEmployeeContext: async (userId: string) => {
    const response = await api.get<EmployeeDossierContext>(
      `/dossiers/employee/${userId}/context`,
    );
    return response.data;
  },

  getSiteContext: async (siteId: string) => {
    const response = await api.get<SiteDossierContext>(
      `/dossiers/site/${siteId}/context`,
    );
    return response.data;
  },

  getEmployeePdfAccess: async (userId: string) => {
    const response = await api.get<DossierPdfAccess>(
      `/dossiers/employee/${userId}/pdf/access`,
    );
    return response.data;
  },

  getSitePdfAccess: async (siteId: string) => {
    const response = await api.get<DossierPdfAccess>(
      `/dossiers/site/${siteId}/pdf/access`,
    );
    return response.data;
  },

  attachEmployeeFinalPdf: async (userId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<DossierAttachPdfResult>(
      `/dossiers/employee/${userId}/pdf/file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  attachSiteFinalPdf: async (siteId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<DossierAttachPdfResult>(
      `/dossiers/site/${siteId}/pdf/file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  downloadEmployeePdf: async (userId: string) => {
    const access = await dossiersService.getEmployeePdfAccess(userId);
    if (access.hasFinalPdf) {
      if (!access.url || access.availability !== 'ready') {
        throw new Error(access.message ?? undefined);
      }
      await openPdfUrl(
        access.url,
        access.originalName || `dossie_colaborador_${userId}.pdf`,
      );
      return access;
    }

    const context = await dossiersService.getEmployeeContext(userId);
    const { generateDossierPdf } = await import('@/lib/pdf/dossierGenerator');
    const { base64, filename } = (await generateDossierPdf(context, {
      save: false,
      output: 'base64',
    })) as { base64: string; filename: string };
    const { base64ToPdfFile } = await import('@/lib/pdf/pdfFile');
    const file = base64ToPdfFile(base64, filename);
    await dossiersService.attachEmployeeFinalPdf(userId, file);

    const finalAccess = await dossiersService.getEmployeePdfAccess(userId);
    if (!finalAccess.url || finalAccess.availability !== 'ready') {
      throw new Error(finalAccess.message ?? undefined);
    }

    await openPdfUrl(
      finalAccess.url,
      finalAccess.originalName || filename || `dossie_colaborador_${userId}.pdf`,
    );
    return finalAccess;
  },

  downloadSitePdf: async (siteId: string) => {
    const access = await dossiersService.getSitePdfAccess(siteId);
    if (access.hasFinalPdf) {
      if (!access.url || access.availability !== 'ready') {
        throw new Error(access.message ?? undefined);
      }
      await openPdfUrl(
        access.url,
        access.originalName || `dossie_unidade_${siteId}.pdf`,
      );
      return access;
    }

    const context = await dossiersService.getSiteContext(siteId);
    const { generateDossierPdf } = await import('@/lib/pdf/dossierGenerator');
    const { base64, filename } = (await generateDossierPdf(context, {
      save: false,
      output: 'base64',
    })) as { base64: string; filename: string };
    const { base64ToPdfFile } = await import('@/lib/pdf/pdfFile');
    const file = base64ToPdfFile(base64, filename);
    await dossiersService.attachSiteFinalPdf(siteId, file);

    const finalAccess = await dossiersService.getSitePdfAccess(siteId);
    if (!finalAccess.url || finalAccess.availability !== 'ready') {
      throw new Error(finalAccess.message ?? undefined);
    }

    await openPdfUrl(
      finalAccess.url,
      finalAccess.originalName || filename || `dossie_unidade_${siteId}.pdf`,
    );
    return finalAccess;
  },
};
