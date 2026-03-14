import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MonthlyReportPdfSource {
  id: string;
  titulo: string;
  mes: number;
  ano: number;
  estatisticas: {
    aprs_count: number;
    pts_count: number;
    dds_count: number;
    checklists_count: number;
    trainings_count: number;
  };
  analise_gandra: string;
  created_at: string;
}

export function generateMonthlyReportPdf(
  report: MonthlyReportPdfSource,
  options: { save?: boolean; output?: 'base64' } = { save: true },
) {
  interface JsPdfWithAutoTable extends jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }

  const doc = new jsPDF() as JsPdfWithAutoTable;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 16;
  const palette = {
    navy: [16, 32, 51] as [number, number, number],
    blue: [31, 78, 121] as [number, number, number],
    teal: [15, 118, 110] as [number, number, number],
    border: [203, 213, 225] as [number, number, number],
    surface: [248, 250, 252] as [number, number, number],
    text: [15, 23, 42] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
  };
  const title = `RELATÓRIO <GST> - ${report.mes}/${report.ano}`;
  const filename = `Relatorio_GST_Gestao_Seguranca_Trabalho_${report.mes}_${report.ano}.pdf`;

  doc.setFillColor(...palette.navy);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(...palette.blue);
  doc.rect(0, 32, pageWidth, 2.4, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(title, margin, 15);

  doc.setFontSize(8.5);
  doc.setTextColor(221, 229, 238);
  doc.text(
    'Relatório executivo de desempenho documental e conformidade',
    margin,
    21,
  );

  doc.setFontSize(10);
  doc.setTextColor(...palette.text);
  doc.text(
    `Gerado em ${format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageWidth - margin,
    15,
    { align: 'right' },
  );
  doc.setFontSize(8);
  doc.setTextColor(...palette.muted);
  doc.text(`Documento: ${report.titulo || '-'}`, pageWidth - margin, 21, {
    align: 'right',
  });

  autoTable(doc, {
    startY: 42,
    margin: { left: margin, right: margin },
    head: [['Indicadores mensais', 'Valor']],
    body: [
      ['APRs:', report.estatisticas.aprs_count.toString()],
      ['PTs:', report.estatisticas.pts_count.toString()],
      ['DDS:', report.estatisticas.dds_count.toString()],
      ['Checklists:', report.estatisticas.checklists_count.toString()],
      ['Treinamentos:', report.estatisticas.trainings_count.toString()],
    ],
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 2.8,
      lineColor: palette.border,
      lineWidth: 0.18,
      textColor: palette.text,
    },
    headStyles: { fillColor: palette.navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
  });

  const analysisStart = doc.lastAutoTable.finalY + 12;
  doc.setFillColor(...palette.surface);
  doc.setDrawColor(...palette.border);
  doc.roundedRect(margin, analysisStart, pageWidth - margin * 2, 12, 2, 2, 'FD');
  doc.setFillColor(...palette.teal);
  doc.rect(margin, analysisStart, 2.5, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...palette.text);
  doc.text('Análise e recomendações', margin + 6, analysisStart + 7.2);

  doc.setFontSize(10);
  doc.setTextColor(...palette.text);
  const text = doc.splitTextToSize(
    report.analise_gandra || '-',
    pageWidth - margin * 2,
  );
  doc.text(text, margin, analysisStart + 20);

  doc.setDrawColor(...palette.border);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
  doc.setFontSize(7);
  doc.setTextColor(...palette.muted);
  doc.text('Sistema <GST> Gestao de Seguranca do Trabalho', margin, pageHeight - 8);
  doc.text('Pagina 1 de 1', pageWidth - margin, pageHeight - 8, {
    align: 'right',
  });

  if (options.save) {
    doc.save(filename);
  }

  if (options.output === 'base64') {
    return {
      filename,
      base64: doc.output('datauristring').split(',')[1],
    };
  }

  return null;
}
