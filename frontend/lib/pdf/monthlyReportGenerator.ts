import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MonthlyReportPdfSource {
  id: string;
  titulo: string;
  mes: number;
  ano: number;
  companyName?: string | null;
  estatisticas: {
    aprs_count: number;
    pts_count: number;
    dds_count: number;
    checklists_count: number;
    trainings_count: number;
    epis_expired_count?: number;
  };
  analise_gandra: string;
  created_at: string;
}

type MetricTone = "info" | "success" | "warning" | "danger";

export interface MonthlyReportMetadataItem {
  label: string;
  value: string;
}

const palette = {
  navy: [16, 32, 51] as [number, number, number],
  blue: [31, 78, 121] as [number, number, number],
  teal: [15, 118, 110] as [number, number, number],
  success: [22, 101, 52] as [number, number, number],
  warning: [180, 83, 9] as [number, number, number],
  danger: [185, 28, 28] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  surfaceStrong: [238, 242, 247] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  secondary: [51, 65, 85] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  onDark: [255, 255, 255] as [number, number, number],
  onDarkMuted: [219, 229, 238] as [number, number, number],
};

function drawRoundedCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
  stroke: [number, number, number] = palette.border,
) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
}

function drawMetricPill(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  tone: MetricTone,
) {
  const accent =
    tone === "success"
      ? palette.success
      : tone === "warning"
        ? palette.warning
        : tone === "danger"
          ? palette.danger
          : palette.blue;

  drawRoundedCard(doc, x, y, w, h, palette.surface, palette.border);
  doc.setFillColor(...accent);
  doc.rect(x, y, 2.5, h, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...palette.muted);
  doc.text(label.toUpperCase(), x + 5, y + 6);

  doc.setFontSize(13);
  doc.setTextColor(...palette.text);
  doc.text(value, x + 5, y + 14);
}

function drawFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  generatedAt: string,
  reportId: string,
  pageNumber: number,
  totalPages: number,
) {
  doc.setDrawColor(...palette.border);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 12.5, pageWidth - margin, pageHeight - 12.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...palette.secondary);
  doc.text("Sistema <GST> Gestao de Seguranca do Trabalho", margin, pageHeight - 8);
  doc.text(`ID: ${reportId}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...palette.muted);
  doc.text(generatedAt, margin, pageHeight - 4.2);
  doc.text(`Pagina ${pageNumber} de ${totalPages}`, pageWidth - margin, pageHeight - 4.2, {
    align: "right",
  });
}

export function buildMonthlyReportMetadata(
  report: MonthlyReportPdfSource,
  generatedAt: string,
): MonthlyReportMetadataItem[] {
  return [
    {
      label: "Empresa",
      value: report.companyName?.trim() || "Empresa nao informada",
    },
    { label: "Documento", value: report.titulo || "Fechamento mensal de conformidade" },
    { label: "Periodo", value: `${String(report.mes).padStart(2, "0")}/${report.ano}` },
    { label: "Emissao", value: generatedAt },
  ];
}

export function paginateMonthlyReportLines(
  lines: string[],
  firstPageLineCapacity: number,
  nextPageLineCapacity: number,
) {
  const safeFirstCapacity = Math.max(1, firstPageLineCapacity);
  const safeNextCapacity = Math.max(1, nextPageLineCapacity);
  const pages: string[][] = [];
  let cursor = 0;
  let capacity = safeFirstCapacity;

  while (cursor < lines.length) {
    pages.push(lines.slice(cursor, cursor + capacity));
    cursor += capacity;
    capacity = safeNextCapacity;
  }

  if (pages.length === 0) {
    pages.push(["-"]);
  }

  return pages;
}

export function generateMonthlyReportPdf(
  report: MonthlyReportPdfSource,
  options: { save?: boolean; output?: "base64" } = { save: true },
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const contentBottomY = pageHeight - 18;
  const title = `RELATORIO <GST> - ${String(report.mes).padStart(2, "0")}/${report.ano}`;
  const filename = `Relatorio_GST_Gestao_Seguranca_Trabalho_${report.mes}_${report.ano}.pdf`;
  const generatedAt = format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const companyName = report.companyName?.trim() || "Empresa nao informada";
  const expiredEpis = report.estatisticas.epis_expired_count ?? 0;
  const totalRecords =
    report.estatisticas.aprs_count +
    report.estatisticas.pts_count +
    report.estatisticas.dds_count +
    report.estatisticas.checklists_count;
  const statusSignal = expiredEpis > 0 ? "Atencao" : totalRecords >= 25 ? "Ativa" : "Estavel";

  doc.setFillColor(...palette.navy);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 34, pageWidth, 2.6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15.5);
  doc.setTextColor(...palette.onDark);
  doc.text(title, margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.setTextColor(...palette.onDarkMuted);
  doc.text("Relatorio executivo de desempenho documental e conformidade", margin, 22);
  doc.setFontSize(8.1);
  doc.text(
    doc.splitTextToSize(`Empresa: ${companyName}`, pageWidth - margin * 2 - 62),
    margin,
    27,
  );

  drawRoundedCard(doc, pageWidth - margin - 56, 9, 56, 18, [255, 255, 255], [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...palette.muted);
  doc.text("EMISSAO DOCUMENTAL", pageWidth - margin - 52, 15);
  doc.setFontSize(10.5);
  doc.setTextColor(...palette.text);
  doc.text(`${String(report.mes).padStart(2, "0")}/${report.ano}`, pageWidth - margin - 52, 21.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(...palette.secondary);
  doc.text(generatedAt, pageWidth - margin - 52, 25.3);

  const metadataY = 44;
  const metadataGap = 4;
  const metadataW = (contentWidth - metadataGap) / 2;
  const metadataH = 20;
  const metadata = buildMonthlyReportMetadata(report, generatedAt);

  metadata.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * (metadataW + metadataGap);
    const y = metadataY + row * (metadataH + metadataGap);
    drawRoundedCard(doc, x, y, metadataW, metadataH, palette.surface, palette.border);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...palette.muted);
    doc.text(item.label.toUpperCase(), x + 4, y + 6.2);
    doc.setFontSize(9.8);
    doc.setTextColor(...palette.text);
    doc.text(doc.splitTextToSize(item.value, metadataW - 8), x + 4, y + 11.4);
  });

  const stripY = metadataY + metadataH * 2 + metadataGap + 7;
  drawRoundedCard(doc, margin, stripY, contentWidth, 21, palette.surface, palette.border);
  doc.setFillColor(...palette.teal);
  doc.rect(margin, stripY, 2.5, 21, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...palette.text);
  doc.text("Leitura executiva do periodo", margin + 6, stripY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...palette.secondary);
  doc.text(
    "Sintese rapida da movimentacao documental, capacitacao e foco corretivo do fechamento mensal.",
    margin + 6,
    stripY + 12,
  );

  const pillY = stripY + 3.5;
  const pillW = 34;
  const pillGap = 3.2;
  drawMetricPill(doc, margin + 86, pillY, pillW, 14, "Registros", String(totalRecords), "info");
  drawMetricPill(doc, margin + 86 + pillW + pillGap, pillY, pillW, 14, "Treinamentos", String(report.estatisticas.trainings_count), report.estatisticas.trainings_count > 0 ? "success" : "warning");
  drawMetricPill(doc, margin + 86 + (pillW + pillGap) * 2, pillY, pillW, 14, "Status", statusSignal, expiredEpis > 0 ? "danger" : "success");

  const dynamicStatsY = stripY + 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...palette.text);
  doc.text("Indicadores mensais", margin, dynamicStatsY);

  const statCards = [
    { label: "APRs emitidas", value: report.estatisticas.aprs_count, tone: "info" as MetricTone },
    { label: "PTs emitidas", value: report.estatisticas.pts_count, tone: "info" as MetricTone },
    { label: "DDS realizados", value: report.estatisticas.dds_count, tone: "success" as MetricTone },
    { label: "Checklists", value: report.estatisticas.checklists_count, tone: "info" as MetricTone },
    { label: "Treinamentos", value: report.estatisticas.trainings_count, tone: report.estatisticas.trainings_count > 0 ? "success" as MetricTone : "warning" as MetricTone },
    { label: "EPIs vencidos", value: expiredEpis, tone: expiredEpis > 0 ? "danger" as MetricTone : "success" as MetricTone },
  ];
  const cardGap = 4;
  const cardW = (contentWidth - cardGap * 2) / 3;
  const cardH = 24;

  statCards.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (cardW + cardGap);
    const y = dynamicStatsY + 6 + row * (cardH + cardGap);
    const accent =
      card.tone === "success"
        ? palette.success
        : card.tone === "warning"
          ? palette.warning
          : card.tone === "danger"
            ? palette.danger
            : palette.blue;
    drawRoundedCard(doc, x, y, cardW, cardH, palette.surface, palette.border);
    doc.setFillColor(...accent);
    doc.rect(x, y, 3, cardH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...palette.text);
    doc.text(String(card.value), x + 7, y + 11.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...palette.muted);
    doc.text(card.label.toUpperCase(), x + 7, y + 17);
  });

  const statsBottomY = dynamicStatsY + 6 + cardH * 2 + cardGap;
  const analysisY = statsBottomY + 8;
  const analysisTextWidth = contentWidth - 10;
  const analysisLines = doc.splitTextToSize(report.analise_gandra || "-", analysisTextWidth) as string[];
  const lineHeight = 4.5;
  const analysisTextStartY = analysisY + 16.5;
  const firstPageCapacity = Math.floor((contentBottomY - analysisTextStartY) / lineHeight);
  const continuationPageTop = margin;
  const continuationTextStartY = continuationPageTop + 16.5;
  const continuationCapacity = Math.floor(
    (contentBottomY - continuationTextStartY) / lineHeight,
  );
  const analysisPages = paginateMonthlyReportLines(
    analysisLines,
    firstPageCapacity,
    continuationCapacity,
  );

  let currentPageTop = analysisY;
  let nextY = analysisY;

  analysisPages.forEach((pageLines, index) => {
    if (index > 0) {
      doc.addPage();
      currentPageTop = continuationPageTop;
    }

    const titleLabel =
      index === 0 ? "Analise e recomendacoes" : "Analise e recomendacoes (continuacao)";
    const cardHeight = Math.max(34, 20 + pageLines.length * lineHeight);
    drawRoundedCard(doc, margin, currentPageTop, contentWidth, cardHeight, palette.surface, palette.border);
    doc.setFillColor(...palette.teal);
    doc.rect(margin, currentPageTop, 2.5, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.8);
    doc.setTextColor(...palette.text);
    doc.text(titleLabel, margin + 6, currentPageTop + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.1);
    doc.setTextColor(...palette.text);
    doc.text(pageLines, margin + 5, currentPageTop + 16.5);
    nextY = currentPageTop + cardHeight + 7;
  });

  const governanceNote = `Documento ${report.id} emitido pelo sistema <GST> para ${companyName}, com acompanhamento executivo do periodo ${String(report.mes).padStart(2, "0")}/${report.ano}.`;
  const governanceLines = doc.splitTextToSize(governanceNote, contentWidth - 8) as string[];
  const governanceHeight = Math.max(18, 11 + governanceLines.length * 4.1);

  if (nextY + governanceHeight > contentBottomY) {
    doc.addPage();
    nextY = margin;
  }

  drawRoundedCard(doc, margin, nextY, contentWidth, governanceHeight, palette.surfaceStrong, palette.border);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.muted);
  doc.text("GOVERNANCA DOCUMENTAL", margin + 4, nextY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...palette.secondary);
  doc.text(governanceLines, margin + 4, nextY + 11.5);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, pageWidth, pageHeight, margin, generatedAt, report.id, page, totalPages);
  }

  if (options.save) {
    doc.save(filename);
  }

  if (options.output === "base64") {
    return {
      filename,
      base64: doc.output("datauristring").split(",")[1],
    };
  }

  return null;
}
