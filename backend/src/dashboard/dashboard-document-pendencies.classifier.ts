export type DocumentPendencyType =
  | 'missing_final_pdf'
  | 'missing_required_signature'
  | 'degraded_document_availability'
  | 'failed_import'
  | 'unavailable_governed_video'
  | 'unavailable_governed_attachment';

export type DocumentPendencyCriticality =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export const DOCUMENT_PENDENCY_TYPE_LABELS: Record<
  DocumentPendencyType,
  string
> = {
  missing_final_pdf: 'Sem PDF final governado',
  missing_required_signature: 'Sem assinatura exigida',
  degraded_document_availability: 'Documento oficial indisponível',
  failed_import: 'Importação falhada',
  unavailable_governed_video: 'Vídeo governado indisponível',
  unavailable_governed_attachment: 'Anexo governado indisponível',
};

export const DOCUMENT_MODULE_LABELS: Record<string, string> = {
  apr: 'APR',
  pt: 'PT',
  dds: 'DDS',
  checklist: 'Checklist',
  inspection: 'Relatório de inspeção',
  rdo: 'RDO',
  cat: 'CAT',
  audit: 'Auditoria',
  nonconformity: 'Não conformidade',
  'document-import': 'Importação documental',
};

const CRITICALITY_WEIGHTS: Record<DocumentPendencyCriticality, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getDocumentPendencyTypeLabel(
  type: DocumentPendencyType,
): string {
  return DOCUMENT_PENDENCY_TYPE_LABELS[type];
}

export function getDocumentModuleLabel(module: string): string {
  return DOCUMENT_MODULE_LABELS[module] || module.toUpperCase();
}

export function getDocumentPendencyCriticalityWeight(
  criticality: DocumentPendencyCriticality,
): number {
  return CRITICALITY_WEIGHTS[criticality];
}

export function resolveDocumentPendencyCriticality(input: {
  type: DocumentPendencyType;
  module: string;
  status?: string | null;
  availabilityStatus?: string | null;
}): DocumentPendencyCriticality {
  const normalizedStatus = (input.status || '').trim().toLowerCase();

  switch (input.type) {
    case 'failed_import':
      return normalizedStatus === 'dead_letter' ? 'critical' : 'high';
    case 'degraded_document_availability':
      return 'high';
    case 'unavailable_governed_video':
      return 'high';
    case 'unavailable_governed_attachment':
      return input.module === 'cat' ? 'medium' : 'high';
    case 'missing_required_signature':
      if (input.module === 'rdo' && normalizedStatus === 'aprovado') {
        return 'critical';
      }
      if (
        normalizedStatus === 'aprovada' ||
        normalizedStatus === 'aprovado' ||
        normalizedStatus === 'arquivado' ||
        normalizedStatus === 'auditado'
      ) {
        return 'high';
      }
      return 'medium';
    case 'missing_final_pdf':
      if (
        input.module === 'apr' ||
        input.module === 'pt' ||
        input.module === 'rdo' ||
        input.module === 'cat'
      ) {
        return 'critical';
      }
      if (
        normalizedStatus === 'arquivado' ||
        normalizedStatus === 'auditado' ||
        normalizedStatus === 'fechada' ||
        normalizedStatus === 'encerrada'
      ) {
        return 'high';
      }
      return 'medium';
    default:
      return 'medium';
  }
}
