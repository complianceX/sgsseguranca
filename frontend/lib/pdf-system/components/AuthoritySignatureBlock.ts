import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { formatDate, sanitize } from "../core/format";

export type AuthoritySignature = {
  label: string;
  name?: string;
  role?: string;
  date?: string;
  image?: string | null;
  signatureType?: string;
};

type AuthoritySignatureBlockOptions = {
  title?: string;
  signatures: AuthoritySignature[];
};

export function drawAuthoritySignatureBlock(
  ctx: PdfContext,
  options: AuthoritySignatureBlockOptions,
) {
  if (!options.signatures.length) return;
  const { doc, margin, contentWidth, theme } = ctx;
  const title = options.title || "Responsabilidade Tecnica e Assinaturas";

  const columns = 2;
  const cardW = (contentWidth - 6) / columns;
  const cardH = 40;
  const rows = Math.ceil(options.signatures.length / columns);
  const totalHeight = 11 + rows * (cardH + 4) + 2;

  ensureSpace(ctx, totalHeight + 4);
  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, totalHeight, 2, 2, "FD");
  doc.setFillColor(...theme.tone.brand);
  doc.rect(margin, ctx.y, 2.5, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(title, margin + 5, ctx.y + 6.5);

  options.signatures.forEach((signature, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = margin + 3 + col * (cardW + 3);
    const y = ctx.y + 12 + row * (cardH + 4);

    doc.setFillColor(...theme.tone.surfaceMuted);
    doc.setDrawColor(...theme.tone.borderStrong);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.caption);
    doc.setTextColor(...theme.tone.textMuted);
    doc.text(sanitize(signature.label).toUpperCase(), x + 2, y + 4.5);

    doc.setDrawColor(...theme.tone.borderStrong);
    doc.setLineWidth(0.2);
    doc.line(x + 2, y + 19, x + cardW - 2, y + 19);

    if (signature.image && signature.image.startsWith("data:image")) {
      try {
        doc.addImage(signature.image, "PNG", x + 2, y + 6, cardW - 4, 11);
      } catch {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(theme.typography.bodySm);
        doc.setTextColor(...theme.tone.textMuted);
        doc.text("Assinatura digital", x + 2, y + 13);
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text("Assinatura digital", x + 2, y + 13);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.bodySm);
    doc.setTextColor(...theme.tone.textPrimary);
    doc.text(sanitize(signature.name), x + 2, y + 24.5, { maxWidth: cardW - 4 });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...theme.tone.textSecondary);
    doc.text(`Cargo: ${sanitize(signature.role)}`, x + 2, y + 29.2, { maxWidth: cardW - 4 });
    doc.text(`Data: ${formatDate(signature.date)}`, x + 2, y + 33.8, { maxWidth: cardW - 4 });
  });

  moveY(ctx, totalHeight + theme.spacing.sectionGap);
}

