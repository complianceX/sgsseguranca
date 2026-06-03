import type { PdfContext } from "./types";
import { formatDateTime, sanitize } from "./format";

const DRAFT_DISCLAIMER_LINES = [
  "RASCUNHO — NÃO É DOCUMENTO OFICIAL",
  "O PDF final oficial é gerado somente pelo backend do SGS.",
];

/**
 * Aplica marca d'água "RASCUNHO" diagonal e rodapé de aviso em todas as páginas.
 *
 * Deve ser chamado apenas em PDFs gerados pelo frontend (previews/rascunhos).
 * PDFs oficiais são gerados exclusivamente pelo backend e registrados no DocumentRegistry —
 * nunca passam por esta função.
 */
export function applyDraftWatermark(ctx: PdfContext) {
  const { doc, pageWidth, pageHeight } = ctx;
  const pages = doc.getNumberOfPages();
  // GState está disponível como propriedade da instância em jsPDF ≥2.x
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GStateClass = (doc as any).GState as
    | (new (opts: Record<string, unknown>) => unknown)
    | undefined;

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);

    // ── Marca d'água diagonal ────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(90);
    doc.setTextColor(150, 150, 150);
    if (GStateClass) {
      doc.setGState(new GStateClass({ opacity: 0.15 }));
    }
    doc.text(
      "RASCUNHO — NÃO É DOCUMENTO OFICIAL",
      pageWidth / 2,
      pageHeight / 2,
      {
        align: "center",
        angle: 45,
      },
    );
    if (GStateClass) {
      doc.setGState(new GStateClass({ opacity: 1 }));
    }

    // ── Rodapé de aviso (abaixo do footer de governança) ────────────────────
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text(DRAFT_DISCLAIMER_LINES, pageWidth / 2, pageHeight - 1.5, {
      align: "center",
    });
  }
}

export function applyDocumentFooter(
  ctx: PdfContext,
  options: {
    code: string;
    generatedAt?: string;
    issuer?: string;
    draft?: boolean;
  },
) {
  const pages = ctx.doc.getNumberOfPages();
  const generatedAt =
    options.generatedAt || formatDateTime(new Date().toISOString());
  const issuer = sanitize(
    options.issuer || "SGS — Sistema de Gestão de Segurança",
  );

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
    ctx.doc.setTextColor(...ctx.theme.tone.textSecondary);
    ctx.doc.text(`Gerado em ${generatedAt}`, ctx.margin, 292.7);

    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(...ctx.theme.tone.textSecondary);
    ctx.doc.text(`ID: ${options.code}`, ctx.pageWidth - ctx.margin, 288.7, {
      align: "right",
    });

    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setTextColor(...ctx.theme.tone.textSecondary);
    ctx.doc.text(
      `Pagina ${page} de ${pages}`,
      ctx.pageWidth - ctx.margin,
      292.7,
      { align: "right" },
    );
  }

  // Aplica marca d'água e aviso de prévia apenas para PDFs em modo rascunho.
  if (options.draft !== false) {
    applyDraftWatermark(ctx);
  }
}
