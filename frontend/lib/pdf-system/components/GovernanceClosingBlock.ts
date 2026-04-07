import QRCode from "qrcode";
import type { PdfContext } from "../core/types";
import { ensureSpace, getRemainingHeight, moveY } from "../core/grid";
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

const SIGNATURE_ROW_HEIGHT = 15.5;

function estimateSignaturePanelHeight(signatures: AuthoritySignature[]) {
  if (!signatures.length) return 0;
  return 10 + signatures.length * SIGNATURE_ROW_HEIGHT + 4;
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

function getMaxSignatureRows(availableBodyHeight: number) {
  return Math.max(
    1,
    Math.floor((Math.max(availableBodyHeight, 34) - 14) / SIGNATURE_ROW_HEIGHT),
  );
}

function drawSignaturePanel(
  ctx: PdfContext,
  signaturesX: number,
  innerY: number,
  signatureW: number,
  bodyHeight: number,
  signatures: AuthoritySignature[],
  heading = "RESPONSABILIDADES",
) {
  const { doc, theme } = ctx;

  doc.setFillColor(...theme.tone.surfaceMuted);
  doc.setDrawColor(...theme.tone.border);
  doc.roundedRect(signaturesX, innerY, signatureW, bodyHeight, 1.8, 1.8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text(heading, signaturesX + 2.5, innerY + 5);

  signatures.forEach((signature, index) => {
    const rowY = innerY + 7.5 + index * SIGNATURE_ROW_HEIGHT;
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

    const isHmac = signature.signatureType === 'hmac' || (
      signature.image != null &&
      !signature.image.startsWith('data:image') &&
      /^[a-f0-9]{64}$/i.test(signature.image)
    );

    if (isHmac) {
      const hmacPreview = signature.image
        ? signature.image.slice(0, 8).toUpperCase()
        : '--------';
      doc.setFillColor(...theme.tone.info);
      doc.roundedRect(signaturesX + signatureW - 20, rowY + 2.5, 16, 8, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(255, 255, 255);
      doc.text("PIN HMAC", signaturesX + signatureW - 12, rowY + 6, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.text(hmacPreview, signaturesX + signatureW - 12, rowY + 9, { align: "center" });
    } else if (signature.image && signature.image.startsWith("data:image")) {
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

function drawValidationPanel(
  ctx: PdfContext,
  validationX: number,
  innerY: number,
  validationW: number,
  bodyHeight: number,
  subtitle: string,
  code: string,
  url: string,
  hash: string | undefined,
  qrDataUrl: string,
) {
  const { doc, theme } = ctx;

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
  const urlLines = doc.splitTextToSize(url, textWidth);
  const hashLines = hash ? doc.splitTextToSize(`Hash: ${hash}`, textWidth) : [];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textSecondary);
  doc.text(subtitleLines, textX, qrY + 3);

  const codeY = qrY + 3 + subtitleLines.length * 3.4 + 2.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(`Código: ${sanitize(code)}`, textX, codeY, { maxWidth: textWidth });

  const urlY = codeY + 4.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.info);
  doc.text(urlLines, textX, urlY);

  if (hash) {
    doc.setTextColor(...theme.tone.textMuted);
    doc.text(hashLines, textX, urlY + urlLines.length * 3 + 1.4);
  }

  doc.setFillColor(...theme.tone.success);
  doc.circle(validationX + validationW - 6, innerY + bodyHeight - 6, 3.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.brandOn);
  doc.text("✓", validationX + validationW - 6, innerY + bodyHeight - 4.8, { align: "center" });
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
  const validationH = estimateValidationPanelHeight(
    ctx,
    validationW - 4,
    subtitle,
    options.url,
    options.hash,
  );
  const qrDataUrl = await QRCode.toDataURL(options.url, {
    margin: 0,
    width: 256,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  let availableFirstBodyHeight = Math.max(34, getRemainingHeight(ctx) - 18);
  let firstSignatureCount = hasSignatures
    ? Math.min(signatures.length, getMaxSignatureRows(availableFirstBodyHeight))
    : 0;
  let firstSignatures = signatures.slice(0, firstSignatureCount);
  let remainingSignatures = signatures.slice(firstSignatureCount);
  let signatureH = estimateSignaturePanelHeight(firstSignatures);
  let bodyHeight = Math.max(signatureH, validationH, 34);
  let totalHeight = bodyHeight + 18;

  const yBeforeSpace = ctx.y;
  ensureSpace(ctx, totalHeight + 4);

  if (ctx.y < yBeforeSpace && hasSignatures) {
    availableFirstBodyHeight = Math.max(34, getRemainingHeight(ctx) - 18);
    firstSignatureCount = Math.min(
      signatures.length,
      getMaxSignatureRows(availableFirstBodyHeight),
    );
    firstSignatures = signatures.slice(0, firstSignatureCount);
    remainingSignatures = signatures.slice(firstSignatureCount);
    signatureH = estimateSignaturePanelHeight(firstSignatures);
    bodyHeight = Math.max(signatureH, validationH, 34);
    totalHeight = bodyHeight + 18;
  }

  const bodyY = ctx.y + 12;

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
    drawSignaturePanel(
      ctx,
      margin + 3,
      innerY,
      signatureW,
      bodyHeight,
      firstSignatures,
    );
  }

  drawValidationPanel(
    ctx,
    validationX,
    innerY,
    validationW,
    bodyHeight,
    subtitle,
    options.code,
    options.url,
    options.hash,
    qrDataUrl,
  );

  moveY(ctx, totalHeight + theme.spacing.sectionGap);

  let continuationCursor = 0;
  while (continuationCursor < remainingSignatures.length) {
    ensureSpace(ctx, 34);
    const availableBodyHeight = Math.max(34, getRemainingHeight(ctx) - 18);
    const chunkSize = getMaxSignatureRows(availableBodyHeight);
    const chunk = remainingSignatures.slice(
      continuationCursor,
      continuationCursor + chunkSize,
    );
    const continuationBodyHeight = Math.max(
      estimateSignaturePanelHeight(chunk),
      34,
    );
    const continuationTotalHeight = continuationBodyHeight + 18;

    ensureSpace(ctx, continuationTotalHeight + 4);

    doc.setFillColor(...theme.tone.surface);
    doc.setDrawColor(...theme.tone.borderStrong);
    doc.setLineWidth(0.32);
    doc.roundedRect(margin, ctx.y, contentWidth, continuationTotalHeight, 2, 2, "FD");

    doc.setFillColor(...theme.tone.brand);
    doc.rect(margin, ctx.y, 2.5, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.headingSm);
    doc.setTextColor(...theme.tone.textPrimary);
    doc.text(`${title} - assinaturas complementares`, margin + 5, ctx.y + 6.5);

    drawSignaturePanel(
      ctx,
      margin + 3,
      ctx.y + 12,
      contentWidth - 6,
      continuationBodyHeight,
      chunk,
      "RESPONSABILIDADES (CONT.)",
    );

    moveY(ctx, continuationTotalHeight + theme.spacing.sectionGap);
    continuationCursor += chunk.length;
  }
}
