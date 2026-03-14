import type { PdfContext } from "./types";
import { formatDateTime, sanitize } from "./format";

export function applyDocumentFooter(
  ctx: PdfContext,
  options: {
    code: string;
    generatedAt?: string;
    issuer?: string;
  },
) {
  const pages = ctx.doc.getNumberOfPages();
  const generatedAt = options.generatedAt || formatDateTime(new Date().toISOString());
  const issuer = sanitize(options.issuer || "Sistema <GST> Gestão de Segurança do Trabalho");

  for (let page = 1; page <= pages; page++) {
    ctx.doc.setPage(page);
    ctx.doc.setDrawColor(...ctx.theme.tone.border);
    ctx.doc.setLineWidth(0.25);
    ctx.doc.line(ctx.margin, 283.5, ctx.pageWidth - ctx.margin, 283.5);

    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(ctx.theme.typography.caption);
    ctx.doc.setTextColor(...ctx.theme.tone.textSecondary);
    ctx.doc.text(issuer, ctx.margin, 288.7);

    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setTextColor(...ctx.theme.tone.textMuted);
    ctx.doc.text(`Gerado em ${generatedAt}`, ctx.margin, 292.7);

    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(...ctx.theme.tone.textSecondary);
    ctx.doc.text(`ID: ${options.code}`, ctx.pageWidth - ctx.margin, 288.7, { align: "right" });

    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setTextColor(...ctx.theme.tone.textMuted);
    ctx.doc.text(`Pagina ${page} de ${pages}`, ctx.pageWidth - ctx.margin, 292.7, { align: "right" });
  }
}
