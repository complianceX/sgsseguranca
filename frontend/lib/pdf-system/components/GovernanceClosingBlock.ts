import QRCode from "qrcode";
import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { formatDate, sanitize } from "../core/format";
import type { AuthoritySignature } from "./AuthoritySignatureBlock";

type GovernanceClosingBlockOptions = {
  code: string;
  url: string;
  hash?: string;
  title?: string;
  subtitle?: string;
  signatures?: AuthoritySignature[];
};

function estimateSignaturePanelHeight(signatures: AuthoritySignature[]) {
  if (!signatures.length) return 0;
  return 10 + signatures.length * 15.5 + 4;
}

function estimateValidationPanelHeight(
  ctx: PdfContext,
  width: number,
  subtitle: string,
  url: string,
  hash?: string,
) {
  const { doc } = ctx;
  const textWidth = Math.max(36, width - 30);
  const subtitleLines = doc.splitTextToSize(subtitle, textWidth);
  const urlLines = doc.splitTextToSize(url, textWidth);
  const hashLines = hash ? doc.splitTextToSize(`Hash: ${hash}`, textWidth) : [];
  return 12 + Math.max(22, subtitleLines.length * 3.3 + 10 + urlLines.length * 3 + hashLines.length * 3 + 6);
}

export async function drawGovernanceClosingBlock(
  ctx: PdfContext,
  options: GovernanceClosingBlockOptions,
) {
  const { doc, margin, contentWidth, theme } = ctx;
  const title = options.title || "Governanca, autenticidade e rastreabilidade";
  const subtitle =
    options.subtitle || "Valide o documento por QR Code ou pelo identificador publico.";
  const signatures = (options.signatures || []).filter(
    (signature) => signature.name || signature.role || signature.image,
  );

  const hasSignatures = signatures.length > 0;
  const gap = 4;
  const validationW = hasSignatures ? Math.max(58, Math.round(contentWidth * 0.34)) : contentWidth - 6;
  const signatureW = hasSignatures ? contentWidth - validationW - gap - 6 : 0;
  const signatureH = estimateSignaturePanelHeight(signatures);
  const validationH = estimateValidationPanelHeight(
    ctx,
    validationW - 4,
    subtitle,
    options.url,
    options.hash,
  );
  const bodyHeight = Math.max(signatureH, validationH, 34);
  const totalHeight = bodyHeight + 18;

  ensureSpace(ctx, totalHeight + 4);
  const bodyY = ctx.y + 12;

  const qrDataUrl = await QRCode.toDataURL(options.url, {
    margin: 0,
    width: 256,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.borderStrong);
  doc.setLineWidth(0.32);
  doc.roundedRect(margin, ctx.y, contentWidth, totalHeight, 2, 2, "FD");

  doc.setFillColor(...theme.tone.brand);
  doc.rect(margin, ctx.y, 2.5, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(title, margin + 5, ctx.y + 6.5);

  const validationX = hasSignatures ? margin + contentWidth - validationW - 3 : margin + 3;
  const innerY = bodyY;

  if (hasSignatures) {
    const signaturesX = margin + 3;
    doc.setFillColor(...theme.tone.surfaceMuted);
    doc.setDrawColor(...theme.tone.border);
    doc.roundedRect(signaturesX, innerY, signatureW, bodyHeight, 1.8, 1.8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.caption);
    doc.setTextColor(...theme.tone.textMuted);
    doc.text("RESPONSABILIDADES", signaturesX + 2.5, innerY + 5);

    signatures.forEach((signature, index) => {
      const rowY = innerY + 7.5 + index * 15.5;
      const rowH = 12.5;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...theme.tone.border);
      doc.roundedRect(signaturesX + 2, rowY, signatureW - 4, rowH, 1.2, 1.2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.caption);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text(sanitize(signature.label).toUpperCase(), signaturesX + 4, rowY + 3.8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textPrimary);
      doc.text(sanitize(signature.name), signaturesX + 4, rowY + 7.8, {
        maxWidth: signatureW - 24,
      });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...theme.tone.textSecondary);
      doc.text(
        `${sanitize(signature.role)} • ${formatDate(signature.date)}`,
        signaturesX + 4,
        rowY + 11,
        { maxWidth: signatureW - 24 },
      );

      if (signature.image && signature.image.startsWith("data:image")) {
        try {
          doc.addImage(signature.image, "PNG", signaturesX + signatureW - 18, rowY + 2.2, 12, 7);
        } catch {
          doc.setFillColor(...theme.tone.success);
          doc.circle(signaturesX + signatureW - 10, rowY + 6.5, 2.1, "F");
        }
      } else {
        doc.setFillColor(...theme.tone.success);
        doc.circle(signaturesX + signatureW - 10, rowY + 6.5, 2.1, "F");
      }
    });
  }

  doc.setFillColor(...theme.tone.surfaceMuted);
  doc.setDrawColor(...theme.tone.border);
  doc.roundedRect(validationX, innerY, validationW, bodyHeight, 1.8, 1.8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text("AUTENTICIDADE", validationX + 2.5, innerY + 5);

  const qrSize = 19;
  const qrX = validationX + 2.5;
  const qrY = innerY + 8;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  const textX = qrX + qrSize + 3;
  const textWidth = validationW - (textX - validationX) - 2.5;
  const subtitleLines = doc.splitTextToSize(subtitle, textWidth);
  const urlLines = doc.splitTextToSize(options.url, textWidth);
  const hashLines = options.hash ? doc.splitTextToSize(`Hash: ${options.hash}`, textWidth) : [];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textSecondary);
  doc.text(subtitleLines, textX, qrY + 3);

  const codeY = qrY + 3 + subtitleLines.length * 3.4 + 2.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(`Codigo: ${sanitize(options.code)}`, textX, codeY, { maxWidth: textWidth });

  const urlY = codeY + 4.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.info);
  doc.text(urlLines, textX, urlY);

  if (options.hash) {
    doc.setTextColor(...theme.tone.textMuted);
    doc.text(hashLines, textX, urlY + urlLines.length * 3 + 1.4);
  }

  doc.setFillColor(...theme.tone.success);
  doc.circle(validationX + validationW - 6, innerY + bodyHeight - 6, 3.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.brandOn);
  doc.text("✓", validationX + validationW - 6, innerY + bodyHeight - 4.8, { align: "center" });

  moveY(ctx, totalHeight + theme.spacing.sectionGap);
}
