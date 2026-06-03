import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";
import { drawStatusBadge } from "./StatusBadge";
import type { RiskLevel } from "../tokens/pdfSemantics";

type RiskSummaryPanelOptions = {
  severity?: string | number;
  probability?: string | number;
  riskLevel?: RiskLevel;
  status?: string;
  priorityAction?: string;
};

export function drawRiskSummaryPanel(ctx: PdfContext, options: RiskSummaryPanelOptions) {
  const { doc, margin, contentWidth, theme } = ctx;
  const colW = (contentWidth - 10) / 2;
  const severityLines = doc.splitTextToSize(sanitize(options.severity), colW - 2);
  const probabilityLines = doc.splitTextToSize(sanitize(options.probability), colW - 2);
  const statusLines = doc.splitTextToSize(sanitize(options.status), colW - 2);
  const actionLines = doc.splitTextToSize(sanitize(options.priorityAction), colW - 2);

  const row1ValueHeight = Math.max(severityLines.length, probabilityLines.length) * 4;
  const row2ValueHeight = Math.max(statusLines.length, actionLines.length) * 4;
  const row1Height = 8 + row1ValueHeight;
  const row2Height = 8 + row2ValueHeight;
  const panelHeight = 12 + row1Height + row2Height + 6;

  ensureSpace(ctx, panelHeight + 4);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, panelHeight, 2, 2, "FD");

  doc.setFillColor(...theme.tone.warning);
  doc.rect(margin, ctx.y, 2.4, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text("Resumo de risco", margin + 5, ctx.y + 6.5);

  const leftX = margin + 4;
  const row1Y = ctx.y + 15;
  const row2Y = row1Y + row1Height;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text("Severidade", leftX, row1Y);
  doc.text("Probabilidade", leftX + colW, row1Y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.body);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(severityLines, leftX, row1Y + 5);
  doc.text(probabilityLines, leftX + colW, row1Y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text("Status", leftX, row2Y);
  doc.text("Medida prioritaria", leftX + colW, row2Y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(statusLines, leftX, row2Y + 5);
  doc.text(actionLines, leftX + colW, row2Y + 5);

  if (options.riskLevel) {
    drawStatusBadge(ctx, { kind: "risk", value: options.riskLevel }, margin + contentWidth - 38, ctx.y + 2);
  }

  moveY(ctx, panelHeight);
}
