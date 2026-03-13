import type { AutoTableFn, PdfContext } from "../core/types";
import { ensureSpace } from "../core/grid";
import type { CellHookData } from "jspdf-autotable";

export type SemanticTableTone = "default" | "risk" | "action" | "attendance";

type SemanticTableOptions = {
  title: string;
  head: string[][];
  body: Array<Array<string | number>>;
  autoTable: AutoTableFn;
  tone?: SemanticTableTone;
  semanticRules?: boolean | { columns?: number[] };
  overrides?: Record<string, unknown>;
};

function paletteForTone(ctx: PdfContext, tone: SemanticTableTone) {
  if (tone === "risk") {
    return { header: ctx.theme.tone.brandStrong, accent: ctx.theme.tone.warning };
  }
  if (tone === "action") {
    return { header: ctx.theme.tone.info, accent: ctx.theme.tone.success };
  }
  if (tone === "attendance") {
    return { header: ctx.theme.tone.brand, accent: ctx.theme.tone.info };
  }
  return { header: ctx.theme.tone.brand, accent: ctx.theme.tone.brandStrong };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shouldApplySemantic(header: string, columnIndex: number, rules?: boolean | { columns?: number[] }) {
  if (rules === false) return false;
  if (typeof rules === "object" && Array.isArray(rules.columns)) {
    return rules.columns.includes(columnIndex);
  }
  const h = normalize(header);
  return (
    h.includes("status") ||
    h.includes("nivel") ||
    h.includes("classific") ||
    h.includes("prazo") ||
    h.includes("resposta") ||
    h.includes("risco")
  );
}

function semanticCellStyle(ctx: PdfContext, value: string) {
  const v = normalize(value);
  if (
    v.includes("critico") ||
    v.includes("critical") ||
    v.includes("nao conforme") ||
    v.includes("bloqueado") ||
    v.includes("interdicao") ||
    v.includes("vencido") ||
    v.includes("reprov")
  ) {
    return { textColor: ctx.theme.tone.danger, fillColor: [254, 242, 242] as [number, number, number], fontStyle: "bold" as const };
  }
  if (
    v.includes("alto") ||
    v.includes("moderad") ||
    v.includes("pendente") ||
    v.includes("em andamento") ||
    v.includes("aguardando")
  ) {
    return { textColor: ctx.theme.tone.warning, fillColor: [255, 247, 237] as [number, number, number], fontStyle: "bold" as const };
  }
  if (
    v.includes("conforme") ||
    v.includes("aprovad") ||
    v.includes("encerrad") ||
    v === "ok" ||
    v === "sim" ||
    v.includes("valido") ||
    v.includes("concluid")
  ) {
    return { textColor: ctx.theme.tone.success, fillColor: [240, 253, 244] as [number, number, number], fontStyle: "bold" as const };
  }
  return null;
}

export function drawSemanticTable(ctx: PdfContext, options: SemanticTableOptions): number {
  const { doc, margin, contentWidth, theme } = ctx;
  const tone = paletteForTone(ctx, options.tone || "default");
  ensureSpace(ctx, 22);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, 10, theme.spacing.radius, theme.spacing.radius, "FD");
  doc.setFillColor(...tone.accent);
  doc.rect(margin, ctx.y, 2.5, 10, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(options.title, margin + 5, ctx.y + 6.5);

  options.autoTable(doc, {
    startY: ctx.y + 11.5,
    margin: { left: margin, right: margin },
    head: options.head,
    body: options.body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: theme.typography.bodySm,
      textColor: theme.tone.textPrimary,
      lineColor: theme.tone.border,
      lineWidth: 0.18,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: tone.header,
      textColor: theme.tone.brandOn,
      fontStyle: "bold",
      fontSize: theme.typography.bodySm,
    },
    alternateRowStyles: {
      fillColor: theme.tone.surfaceMuted,
    },
    didParseCell: (data: CellHookData) => {
      if (data.section !== "body") return;
      const headerValue = String(options.head?.[0]?.[data.column.index] || "");
      if (!shouldApplySemantic(headerValue, data.column.index, options.semanticRules)) return;
      const raw = String(data.cell.raw || "");
      const style = semanticCellStyle(ctx, raw);
      if (!style) return;
      data.cell.styles.textColor = style.textColor;
      data.cell.styles.fillColor = style.fillColor;
      data.cell.styles.fontStyle = style.fontStyle;
    },
    ...options.overrides,
  });

  const withTable = doc as typeof doc & { lastAutoTable?: { finalY?: number } };
  ctx.y = (withTable.lastAutoTable?.finalY || ctx.y + 20) + theme.spacing.sectionGap;
  return ctx.y;
}
