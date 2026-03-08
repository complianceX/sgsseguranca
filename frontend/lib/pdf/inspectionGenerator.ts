import type { Inspection } from '@/services/inspectionsService';
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

export async function generateInspectionPdf(
  inspection: Inspection,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildDocumentCode('INS', (inspection as any).id || inspection.tipo_inspecao);
  let y = drawHeader(doc, {
    title: 'RELATÓRIO DE INSPEÇÃO',
    subtitle: 'Inspeção de Segurança do Trabalho',
    date: formatDate(inspection.data_inspecao),
    code,
    logoText: 'CX',
  });

  y = drawBadge(doc, y, 'Tema / tipo', sanitize(inspection.tipo_inspecao), 'secondary');
  y = drawInfoCard(doc, y, 'Informações da inspeção', [
    { label: 'Tipo', value: sanitize(inspection.tipo_inspecao) },
    { label: 'Setor / Área', value: sanitize(inspection.setor_area) },
    { label: 'Data', value: formatDate(inspection.data_inspecao) },
    { label: 'Horário', value: sanitize(inspection.horario) },
    { label: 'Responsável', value: sanitize(inspection.responsavel?.nome) },
    { label: 'Site / Obra', value: sanitize(inspection.site?.nome) },
    { label: 'Objetivo', value: sanitize(inspection.objetivo) },
  ]);

  if (inspection.metodologia?.length) {
    y = drawTextCard(doc, y, 'Metodologia', inspection.metodologia.map((item) => `• ${item}`).join('\n'));
  }

  if (inspection.perigos_riscos?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      'Perigos e riscos identificados',
      [['Grupo', 'Perigo / Fator', 'Expostos', 'Risco', 'Ações', 'Prazo']],
      inspection.perigos_riscos.map((item) => [
        sanitize(item.grupo_risco),
        sanitize(item.perigo_fator_risco),
        sanitize(item.trabalhadores_expostos),
        sanitize(item.nivel_risco),
        sanitize(item.acoes_necessarias),
        sanitize(item.prazo),
      ]),
      { styles: { fontSize: 7, cellPadding: 2 } },
    );
  }

  if (inspection.plano_acao?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      'Plano de ação',
      [['Ação', 'Responsável', 'Prazo', 'Status']],
      inspection.plano_acao.map((item) => [
        sanitize(item.acao),
        sanitize(item.responsavel),
        sanitize(item.prazo),
        sanitize(item.status),
      ]),
    );
  }

  y = drawTextCard(doc, y, 'Conclusão', inspection.conclusao);
  y = await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = buildPdfFilename('INSPECAO', `${inspection.tipo_inspecao}_${inspection.setor_area}`, inspection.data_inspecao);
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
