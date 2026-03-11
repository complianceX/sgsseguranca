import type { Audit } from '@/services/auditsService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawModernTable,
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from './pdfLayout';

type PdfOptions = { save?: boolean; output?: 'base64' };

export async function generateAuditPdf(
  audit: Audit,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildDocumentCode('AUD', (audit as any).id || audit.titulo);
  let y = drawHeader(doc, {
    title: 'RELATÓRIO DE AUDITORIA',
    subtitle: sanitize(audit.tipo_auditoria),
    date: formatDate(audit.data_auditoria),
    code,
    logoText: 'GST',
  });

  y = drawBadge(doc, y, 'Tipo de auditoria', sanitize(audit.tipo_auditoria), 'accent');
  y = drawInfoCard(doc, y, 'Informações da auditoria', [
    { label: 'Título', value: sanitize(audit.titulo) },
    { label: 'Data', value: formatDate(audit.data_auditoria) },
    { label: 'Auditor', value: sanitize(audit.auditor?.nome) },
    { label: 'Site / Obra', value: sanitize(audit.site?.nome) },
    { label: 'Representantes', value: sanitize(audit.representantes_empresa) },
  ]);

  y = drawTextCard(doc, y, 'Objetivo', audit.objetivo);
  y = drawTextCard(doc, y, 'Escopo', audit.escopo);
  y = drawTextCard(doc, y, 'Metodologia', audit.metodologia);
  y = drawTextCard(doc, y, 'Conclusão', audit.conclusao);

  if (audit.resultados_nao_conformidades?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      'Não conformidades identificadas',
      [['Descrição', 'Requisito', 'Evidência', 'Classificação']],
      audit.resultados_nao_conformidades.map((item) => [
        sanitize(item.descricao),
        sanitize(item.requisito),
        sanitize(item.evidencia),
        sanitize(item.classificacao),
      ]),
    );
  }

  if (audit.plano_acao?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      'Plano de ação',
      [['Item', 'Ação', 'Responsável', 'Prazo', 'Status']],
      audit.plano_acao.map((item) => [
        sanitize(item.item),
        sanitize(item.acao),
        sanitize(item.responsavel),
        sanitize(item.prazo),
        sanitize(item.status),
      ]),
    );
  }

  y = await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = buildPdfFilename('AUDITORIA', audit.titulo, audit.data_auditoria);
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
