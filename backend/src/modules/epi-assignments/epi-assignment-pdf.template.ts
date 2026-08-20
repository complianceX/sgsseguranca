import {
  buildInstitutionalHeaderHtml,
  INSTITUTIONAL_PDF_CSS,
  escapeInstitutionalPdfHtml,
} from '../../shared/services/pdf-institutional-template';

export interface EpiAssignmentPdfData {
  id: string;
  company_id: string;
  site_id?: string | null;
  quantidade: number;
  ca?: string | null;
  validade_ca?: Date | string | null;
  entregue_em: Date | string;
  observacoes?: string | null;
  company?: { razao_social?: string | null } | null;
  site?: { nome?: string | null } | null;
  user?: { nome?: string | null } | null;
  epi?: { nome?: string | null } | null;
  assinatura_entrega?: {
    signer_name?: string;
    signature_type?: string;
    signature_hash?: string;
    timestamp_issued_at?: string;
    timestamp_authority?: string;
  } | null;
}

export function buildEpiDocumentCode(id: string): string {
  return `EPI-${id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

export function buildEpiAssignmentPdfHtml(
  assignment: EpiAssignmentPdfData,
  documentCode = buildEpiDocumentCode(assignment.id),
): string {
  const escapeHtml = (value: unknown): string => {
    let text: string;
    if (value === null || value === undefined || value === '') {
      text = '-';
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      text = String(value);
    } else {
      try {
        text = JSON.stringify(value) ?? '-';
      } catch {
        text = '-';
      }
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
  const formatDate = (
    value: Date | string | null | undefined,
    withTime = false,
  ): string => {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      ...(withTime ? { timeStyle: 'short' as const } : {}),
      timeZone: 'America/Araguaina',
    }).format(date);
  };
  const field = (label: string, value: unknown) =>
    `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const signature = assignment.assinatura_entrega;

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${INSTITUTIONAL_PDF_CSS}</style></head>
<body>
  ${buildInstitutionalHeaderHtml({
    title: 'Ficha de Entrega de EPI',
    subtitle:
      'Documento oficial operacional de entrega, assinatura e rastreabilidade de equipamento de proteção individual.',
    code: documentCode,
    status: 'Emitido',
    company: assignment.company?.razao_social || assignment.company_id,
    site: assignment.site?.nome,
    referenceDate: formatDate(assignment.entregue_em, true),
  })}
  <div class="section-title">Identificação</div>
  <div class="grid">
    ${field('Empresa', assignment.company?.razao_social || assignment.company_id)}
    ${field('Obra', assignment.site?.nome)}
    ${field('Trabalhador', assignment.user?.nome)}
    ${field('Equipamento', assignment.epi?.nome)}
    ${field('Quantidade', assignment.quantidade)}
    ${field('C.A.', assignment.ca)}
    ${field('Validade do C.A.', formatDate(assignment.validade_ca))}
    ${field('Data da entrega', formatDate(assignment.entregue_em, true))}
  </div>
  <div class="section-title">Observações</div>
  <div class="observations">${escapeHtml(assignment.observacoes)}</div>
  <div class="section-title">Prova de assinatura</div>
  <div class="grid">
    ${field('Signatario', signature?.signer_name || assignment.user?.nome)}
    ${field('Tipo', signature?.signature_type)}
    ${field('Hash da assinatura', signature?.signature_hash)}
    ${field('Carimbo emitido em', signature?.timestamp_issued_at)}
    ${field('Autoridade do carimbo', signature?.timestamp_authority)}
  </div>
  <div class="governance">Este PDF é um snapshot imutável da entrega registrada. Dados brutos da assinatura não são incorporados ao documento.</div>
  <div class="integrity">Tenant resolvido no servidor: ${escapeInstitutionalPdfHtml(assignment.company_id)} - Ficha: ${escapeInstitutionalPdfHtml(assignment.id)}</div>
</body></html>`;
}
