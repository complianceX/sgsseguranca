import type { NonConformity } from '@/services/nonConformitiesService';
import { pdfDocToBase64 } from './pdfBase64';

type PdfOptions = { save?: boolean; output?: 'base64' };

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

function sanitize(text?: string | null): string {
  return text || '-';
}

export async function generateNonConformityPdf(
  nc: NonConformity,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(234, 88, 12);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE NÃO CONFORMIDADE', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Código: ${nc.codigo_nc} • Tipo: ${sanitize(nc.tipo)}`, pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Metadata
  const meta: [string, string][] = [
    ['Código NC', sanitize(nc.codigo_nc)],
    ['Tipo', sanitize(nc.tipo)],
    ['Data Identificação', formatDate(nc.data_identificacao)],
    ['Status', sanitize(nc.status)],
    ['Local / Setor', sanitize(nc.local_setor_area)],
    ['Atividade', sanitize(nc.atividade_envolvida)],
    ['Responsável Área', sanitize(nc.responsavel_area)],
    ['Auditor Responsável', sanitize(nc.auditor_responsavel)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(255, 247, 237);
  doc.rect(margin, y, contentW, 30, 'F');
  doc.setDrawColor(254, 215, 170);
  doc.rect(margin, y, contentW, 30);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(154, 52, 18);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 55), xBase + 30, yRow + 4);
  });
  y += 30 + 6;

  // Helper to add a text section
  const addSection = (title: string, content?: string) => {
    if (!content) return;
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(234, 88, 12);
    doc.text(title, margin, y);
    doc.setDrawColor(254, 215, 170);
    doc.line(margin + doc.getTextWidth(title) + 2, y, margin + contentW, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(content, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 5;
  };

  addSection('Descrição da Não Conformidade', nc.descricao);
  addSection('Evidência Observada', nc.evidencia_observada);
  addSection('Condição Insegura', nc.condicao_insegura);
  addSection('Ato Inseguro', nc.ato_inseguro);
  addSection('Risco / Perigo', nc.risco_perigo);
  addSection('Risco Associado', nc.risco_associado);

  if (nc.causa && nc.causa.length > 0) {
    addSection('Causas Identificadas', nc.causa.join('; ') + (nc.causa_outro ? ` (${nc.causa_outro})` : ''));
  }

  // Ações
  const acoesData: [string, string, string, string, string][] = [];
  if (nc.acao_imediata_descricao) {
    acoesData.push(['Imediata', sanitize(nc.acao_imediata_descricao), sanitize(nc.acao_imediata_responsavel), sanitize(nc.acao_imediata_data), sanitize(nc.acao_imediata_status)]);
  }
  if (nc.acao_definitiva_descricao) {
    acoesData.push(['Definitiva', sanitize(nc.acao_definitiva_descricao), sanitize(nc.acao_definitiva_responsavel), sanitize(nc.acao_definitiva_prazo), '-']);
  }

  if (acoesData.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(234, 88, 12);
    doc.text('Ações Corretivas', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Tipo', 'Descrição', 'Responsável', 'Prazo/Data', 'Status']],
      body: acoesData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 247, 237] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  addSection('Verificação / Resultado', nc.verificacao_resultado);
  addSection('Observações Gerais', nc.observacoes_gerais);

  // Signature lines
  if (y > 240) { doc.addPage(); y = margin; }
  const sigLabels = ['Responsável pela Área', 'Técnico / Auditor', 'Gestão'];
  const sigW = contentW / 3;
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(234, 88, 12);
  doc.text('Assinaturas', margin, y);
  y += 8;

  sigLabels.forEach((label, idx) => {
    const xSig = margin + idx * sigW;
    doc.setDrawColor(180, 180, 180);
    doc.line(xSig + 2, y + 16, xSig + sigW - 6, y + 16);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(label, xSig + 2, y + 20);
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`NC ${nc.codigo_nc} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `NC_${nc.codigo_nc}_${formatDate(nc.data_identificacao).replace(/\//g, '-')}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
