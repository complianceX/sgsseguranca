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

export function drawExecutiveSummaryStrip(
  ctx: PdfContext,
  options: ExecutiveSummaryOptions,
) {
  const { doc, margin, contentWidth, theme } = ctx;
  const summaryLines = options.summary
    ? (doc.splitTextToSize(options.summary, contentWidth - 10) as string[])
    : [];
  const columns = options.metrics.length <= 4 ? 2 : 3;
  const gap = 3;
  const colWidth =
    (contentWidth - 8 - gap * Math.max(0, columns - 1)) / columns;

  const metricBlocks = options.metrics.map((metric) => {
    const labelLines = doc.splitTextToSize(
      metric.label.toUpperCase(),
      colWidth - 7,
    ) as string[];
    const valueLines = doc.splitTextToSize(
      sanitize(metric.value),
      colWidth - 7,
    ) as string[];
    const blockHeight = 8 + labelLines.length * 2.8 + valueLines.length * 4.2 + 2.6;
    return { metric, labelLines, valueLines, blockHeight };
  });

  let metricsHeight = 0;
  for (let i = 0; i < metricBlocks.length; i += columns) {
    const rowHeight = Math.max(
      ...metricBlocks.slice(i, i + columns).map((x) => x.blockHeight),
      11,
    );
    metricsHeight += rowHeight + 2.2;
  }

  const summaryHeight = summaryLines.length ? summaryLines.length * 4.2 + 4 : 0;
  const height = 14 + summaryHeight + metricsHeight + 2;
  ensureSpace(ctx, height + 5);

  doc.setFillColor(...theme.tone.surfaceMuted);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(
    margin,
    ctx.y,
    contentWidth,
    height,
    theme.spacing.radius,
    theme.spacing.radius,
    "FD",
  );
  doc.setFillColor(...theme.tone.brand);
  doc.roundedRect(
    margin + 1.8,
    ctx.y + 1.6,
    30,
    3.1,
    theme.spacing.radius / 2,
    theme.spacing.radius / 2,
    "F",
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...theme.tone.textPrimary);
  doc.setFontSize(theme.typography.headingSm);
  doc.text(options.title, margin + 4, ctx.y + 8.2);

  let cursorY = ctx.y + 13.5;
  if (summaryLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(theme.typography.bodySm);
    doc.setTextColor(...theme.tone.textSecondary);
    doc.text(summaryLines, margin + 4, cursorY);
    cursorY += summaryLines.length * 4.2 + 2.5;
  }

  const rowOffsets: number[] = [];
  let cumulativeY = cursorY;
  for (let i = 0; i < metricBlocks.length; i += columns) {
    rowOffsets.push(cumulativeY);
    const rowHeight = Math.max(
      ...metricBlocks.slice(i, i + columns).map((x) => x.blockHeight),
      11,
    );
    cumulativeY += rowHeight + 2.2;
  }

  metricBlocks.forEach((entry, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = margin + 4 + col * (colWidth + gap);
    const y = rowOffsets[row];
    const cardH = Math.max(entry.blockHeight, 11);
    const tone = toneColor(ctx, entry.metric.tone);

    doc.setFillColor(...theme.tone.surface);
    doc.setDrawColor(...theme.tone.border);
    doc.setLineWidth(0.22);
    doc.roundedRect(x, y, colWidth, cardH, 1.8, 1.8, "FD");
    doc.setFillColor(...tone);
    doc.roundedRect(x + 1.4, y + 1.3, colWidth - 2.8, 3.1, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.caption);
    doc.setTextColor(...theme.tone.textMuted);
    doc.text(entry.labelLines, x + 2.6, y + 8.4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.headingMd);
    doc.setTextColor(...theme.tone.textPrimary);
    const valueY = y + 3.8 + entry.labelLines.length * 2.8 + 5.8;
    doc.text(entry.valueLines, x + 2.6, valueY);
  });

  moveY(ctx, height + theme.spacing.sectionGap);
}
