import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

export type ExecutiveMetric = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

export type ExecutiveSummaryOptions = {
  title: string;
  summary?: string;
  metrics: ExecutiveMetric[];
};

function toneColor(ctx: PdfContext, tone: ExecutiveMetric["tone"]) {
  if (tone === "success") return ctx.theme.tone.success;
  if (tone === "warning") return ctx.theme.tone.warning;
  if (tone === "danger") return ctx.theme.tone.danger;
  if (tone === "info") return ctx.theme.tone.info;
  return ctx.theme.tone.brand;
}

export function drawExecutiveSummaryStrip(ctx: PdfContext, options: ExecutiveSummaryOptions) {
  const { doc, margin, contentWidth, theme } = ctx;
  const summaryLines = options.summary ? doc.splitTextToSize(options.summary, contentWidth - 8) : [];
  const colWidth = (contentWidth - 8) / 3;

  const metricBlocks = options.metrics.map((metric) => {
    const labelLines = doc.splitTextToSize(metric.label.toUpperCase(), colWidth - 7);
    const valueLines = doc.splitTextToSize(sanitize(metric.value), colWidth - 7);
    const blockHeight = 3 + labelLines.length * 2.8 + valueLines.length * 3.6 + 2.2;
    return { metric, labelLines, valueLines, blockHeight };
  });

  let metricsHeight = 0;
  for (let i = 0; i < metricBlocks.length; i += 3) {
    const rowHeight = Math.max(...metricBlocks.slice(i, i + 3).map((x) => x.blockHeight), 11);
    metricsHeight += rowHeight + 2;
  }

  const summaryHeight = summaryLines.length ? summaryLines.length * 4.2 + 3 : 0;
  const height = 13 + summaryHeight + metricsHeight + 2;
  ensureSpace(ctx, height + 5);

  doc.setFillColor(...theme.tone.surfaceMuted);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, height, theme.spacing.radius, theme.spacing.radius, "FD");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...theme.tone.textPrimary);
  doc.setFontSize(theme.typography.headingSm);
  doc.text(options.title, margin + 4, ctx.y + 7);

  let cursorY = ctx.y + 12;
  if (summaryLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(theme.typography.bodySm);
    doc.setTextColor(...theme.tone.textSecondary);
    doc.text(summaryLines, margin + 4, cursorY);
    cursorY += summaryLines.length * 4.2 + 2.5;
  }

  const rowOffsets: number[] = [];
  let cumulativeY = cursorY;
  for (let i = 0; i < metricBlocks.length; i += 3) {
    rowOffsets.push(cumulativeY);
    const rowHeight = Math.max(...metricBlocks.slice(i, i + 3).map((x) => x.blockHeight), 11);
    cumulativeY += rowHeight + 2;
  }

  metricBlocks.forEach((entry, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = margin + 4 + col * colWidth;
    const y = rowOffsets[row];
    const cardH = Math.max(entry.blockHeight, 11);

    doc.setFillColor(...toneColor(ctx, entry.metric.tone));
    doc.roundedRect(x, y, colWidth - 3, cardH, 1.5, 1.5, "F");

    doc.setTextColor(...theme.tone.brandOn);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.caption);
    doc.text(entry.labelLines, x + 2, y + 3.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(theme.typography.bodySm);
    const valueY = y + 3.8 + entry.labelLines.length * 2.8 + 0.6;
    doc.text(entry.valueLines, x + 2, valueY);
  });

  moveY(ctx, height + theme.spacing.sectionGap);
}
