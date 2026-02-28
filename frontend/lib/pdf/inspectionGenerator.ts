import type { Inspection } from '@/services/inspectionsService';
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

export async function generateInspectionPdf(
  inspection: Inspection,
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
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE INSPEÇÃO DE SEGURANÇA', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitize(inspection.tipo_inspecao), pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${inspection.tipo_inspecao} — ${inspection.setor_area}`, margin, y);
  y += 8;

  // Metadata
  const meta: [string, string][] = [
    ['Setor / Área', sanitize(inspection.setor_area)],
    ['Data', formatDate(inspection.data_inspecao)],
    ['Horário', sanitize(inspection.horario)],
    ['Responsável', sanitize(inspection.responsavel?.nome)],
    ['Site', sanitize(inspection.site?.nome)],
    ['Objetivo', sanitize(inspection.objetivo)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(254, 242, 242);
  doc.rect(margin, y, contentW, 22, 'F');
  doc.setDrawColor(254, 202, 202);
  doc.rect(margin, y, contentW, 22);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(153, 27, 27);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 65), xBase + 24, yRow + 4);
  });
  y += 22 + 6;

  // Metodologia
  if (inspection.metodologia && inspection.metodologia.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Metodologia', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    inspection.metodologia.forEach((m) => {
      doc.text(`• ${m}`, margin + 3, y);
      y += 5;
    });
    y += 2;
  }

  // Perigos e Riscos
  if (inspection.perigos_riscos && inspection.perigos_riscos.length > 0) {
    if (y > 200) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Perigos e Riscos Identificados', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Grupo Risco', 'Perigo / Fator', 'Trabalhadores Exp.', 'Nível Risco', 'Ações Necessárias', 'Prazo']],
      body: inspection.perigos_riscos.map((pr) => [
        sanitize(pr.grupo_risco),
        sanitize(pr.perigo_fator_risco),
        sanitize(pr.trabalhadores_expostos),
        sanitize(pr.nivel_risco),
        sanitize(pr.acoes_necessarias),
        sanitize(pr.prazo),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Plano de Ação
  if (inspection.plano_acao && inspection.plano_acao.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Plano de Ação', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Ação', 'Responsável', 'Prazo', 'Status']],
      body: inspection.plano_acao.map((a) => [
        sanitize(a.acao),
        sanitize(a.responsavel),
        sanitize(a.prazo),
        sanitize(a.status),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Conclusão
  if (inspection.conclusao) {
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Conclusão', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(inspection.conclusao, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 5;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Inspeção: ${inspection.tipo_inspecao} — ${inspection.setor_area} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `Inspecao_${inspection.tipo_inspecao.replace(/\s+/g, '_').substring(0, 20)}_${formatDate(inspection.data_inspecao).replace(/\//g, '-')}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
