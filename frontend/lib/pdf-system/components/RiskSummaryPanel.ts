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
  ensureSpace(ctx, 30);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, 26, 2, 2, "FD");

  doc.setFillColor(...theme.tone.warning);
  doc.rect(margin, ctx.y, 2.4, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text("Resumo de risco", margin + 5, ctx.y + 6.5);

  const leftX = margin + 4;
  const rowY = ctx.y + 15;
  const colW = (contentWidth - 10) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text("Severidade", leftX, rowY);
  doc.text("Probabilidade", leftX + colW, rowY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.body);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(sanitize(options.severity), leftX, rowY + 5);
  doc.text(sanitize(options.probability), leftX + colW, rowY + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text("Status", leftX, rowY + 11);
  doc.text("Medida prioritaria", leftX + colW, rowY + 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(sanitize(options.status), leftX, rowY + 15);
  const actionLines = doc.splitTextToSize(sanitize(options.priorityAction), colW - 2);
  doc.text(actionLines, leftX + colW, rowY + 15);

  if (options.riskLevel) {
    drawStatusBadge(ctx, { kind: "risk", value: options.riskLevel }, margin + contentWidth - 38, ctx.y + 2);
  }

  moveY(ctx, 30);
}
