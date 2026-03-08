import QRCode from 'qrcode';

type PdfDoc = any;
type AutoTableFn = (doc: PdfDoc, options: Record<string, unknown>) => void;

type Color = [number, number, number];

type HeaderOptions = {
  title: string;
  subtitle: string;
  date?: string;
  code: string;
  logoText?: string;
};

type InfoField = {
  label: string;
  value: string;
};

type SignatureField = {
  label: string;
  name?: string;
  role?: string;
  date?: string;
  image?: string | null;
};

type FooterOptions = {
  code: string;
  generatedAt?: string;
  validationUrl?: string;
};

export const PDF_THEME = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 14,
  contentWidth: 182,
  colors: {
    primary: [31, 41, 55] as Color,
    secondary: [245, 158, 11] as Color,
    accent: [37, 99, 235] as Color,
    background: [248, 250, 252] as Color,
    border: [229, 231, 235] as Color,
    text: [17, 24, 39] as Color,
    muted: [107, 114, 128] as Color,
    success: [5, 150, 105] as Color,
    danger: [220, 38, 38] as Color,
  },
};

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleString('pt-BR');
}

export function sanitize(text?: string | number | boolean | null): string {
  if (text === undefined || text === null || text === '') return '-';
  return String(text);
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export function buildDocumentCode(prefix: string, reference?: string | number | null): string {
  const date = new Date();
  const year = date.getFullYear();
  const ref = sanitize(reference)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toUpperCase();
  return `${prefix}-${year}-${ref || `${Date.now()}`.slice(-6)}`;
}

export function buildValidationUrl(code: string): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const origin = typeof window !== 'undefined' ? window.location.origin : envUrl || 'https://compliancex.app';
  return `${origin.replace(/\/$/, '')}/validar/${code}`;
}

export function createPdfDoc() {
  return {
    pageW: PDF_THEME.pageWidth,
    pageH: PDF_THEME.pageHeight,
    margin: PDF_THEME.margin,
    contentW: PDF_THEME.contentWidth,
  };
}

export function ensurePageSpace(doc: PdfDoc, y: number, heightNeeded: number, top = 24): number {
  if (y + heightNeeded <= PDF_THEME.pageHeight - 24) return y;
  doc.addPage();
  return top;
}

export function drawPageBackground(doc: PdfDoc) {
  doc.setFillColor(...PDF_THEME.colors.background);
  doc.rect(0, 0, PDF_THEME.pageWidth, PDF_THEME.pageHeight, 'F');
}

export function drawHeader(doc: PdfDoc, options: HeaderOptions): number {
  drawPageBackground(doc);
  doc.setFillColor(...PDF_THEME.colors.primary);
  doc.rect(0, 0, PDF_THEME.pageWidth, 32, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(PDF_THEME.margin, 7, 28, 18, 3, 3, 'F');
  doc.setTextColor(...PDF_THEME.colors.secondary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(options.logoText || 'CX', PDF_THEME.margin + 14, 18, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(options.title, PDF_THEME.margin + 34, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(options.subtitle, PDF_THEME.margin + 34, 20);
  doc.text(`Data: ${sanitize(options.date)}`, PDF_THEME.margin + 34, 25);

  doc.setTextColor(...PDF_THEME.colors.primary);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(PDF_THEME.pageWidth - 62, 8, 48, 14, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ID DO DOCUMENTO', PDF_THEME.pageWidth - 38, 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(options.code, PDF_THEME.pageWidth - 38, 18, { align: 'center' });

  return 40;
}

export function drawCardTitle(doc: PdfDoc, title: string, x: number, y: number) {
  doc.setTextColor(...PDF_THEME.colors.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), x + 4, y + 6);
}

export function drawInfoCard(
  doc: PdfDoc,
  y: number,
  title: string,
  fields: InfoField[],
  columns = 2,
): number {
  const rows = Math.max(1, Math.ceil(fields.length / columns));
  const height = 12 + rows * 10;
  y = ensurePageSpace(doc, y, height + 4);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_THEME.colors.border);
  doc.roundedRect(PDF_THEME.margin, y, PDF_THEME.contentWidth, height, 3, 3, 'FD');
  drawCardTitle(doc, title, PDF_THEME.margin, y);

  const colW = PDF_THEME.contentWidth / columns;
  fields.forEach((field, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const baseX = PDF_THEME.margin + col * colW + 4;
    const baseY = y + 14 + row * 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_THEME.colors.muted);
    doc.text(`${field.label}:`, baseX, baseY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_THEME.colors.text);
    doc.text(String(field.value).slice(0, 42), baseX, baseY + 4);
  });

  return y + height + 6;
}

export function drawBadge(doc: PdfDoc, y: number, label: string, value: string, tone: 'accent' | 'secondary' | 'danger' = 'accent'): number {
  const color = PDF_THEME.colors[tone];
  const text = `${label}: ${value}`;
  const width = Math.min(PDF_THEME.contentWidth, doc.getTextWidth(text) + 12);
  y = ensurePageSpace(doc, y, 12);
  doc.setFillColor(...color);
  doc.roundedRect(PDF_THEME.margin, y, width, 10, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, PDF_THEME.margin + 6, y + 6.5);
  return y + 14;
}

export function drawTextCard(doc: PdfDoc, y: number, title: string, content?: string | null): number {
  if (!content) return y;
  const lines = doc.splitTextToSize(String(content), PDF_THEME.contentWidth - 8);
  const height = Math.max(24, 12 + lines.length * 4.6);
  y = ensurePageSpace(doc, y, height + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_THEME.colors.border);
  doc.roundedRect(PDF_THEME.margin, y, PDF_THEME.contentWidth, height, 3, 3, 'FD');
  drawCardTitle(doc, title, PDF_THEME.margin, y);
  doc.setTextColor(...PDF_THEME.colors.text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(lines, PDF_THEME.margin + 4, y + 16);
  return y + height + 6;
}

export function drawModernTable(
  doc: PdfDoc,
  autoTable: AutoTableFn,
  y: number,
  title: string,
  head: string[][],
  body: (string | number)[][],
  overrides?: Record<string, unknown>,
): number {
  y = ensurePageSpace(doc, y, 24);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_THEME.colors.border);
  doc.roundedRect(PDF_THEME.margin, y, PDF_THEME.contentWidth, 12, 3, 3, 'FD');
  drawCardTitle(doc, title, PDF_THEME.margin, y);

  autoTable(doc, {
    startY: y + 14,
    margin: { left: PDF_THEME.margin, right: PDF_THEME.margin },
    head,
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: PDF_THEME.colors.text,
      lineColor: PDF_THEME.colors.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_THEME.colors.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    ...overrides,
  });

  return ((doc as any).lastAutoTable?.finalY || y + 20) + 8;
}

export function drawSignatureCard(doc: PdfDoc, y: number, signatures: SignatureField[]): number {
  if (!signatures.length) return y;
  const columns = 2;
  const boxW = (PDF_THEME.contentWidth - 6) / columns;
  const boxH = 38;
  const rows = Math.ceil(signatures.length / columns);
  const height = 12 + rows * (boxH + 4);
  y = ensurePageSpace(doc, y, height + 4);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_THEME.colors.border);
  doc.roundedRect(PDF_THEME.margin, y, PDF_THEME.contentWidth, height, 3, 3, 'FD');
  drawCardTitle(doc, 'Assinaturas', PDF_THEME.margin, y);

  signatures.forEach((signature, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = PDF_THEME.margin + 3 + col * (boxW + 3);
    const baseY = y + 12 + row * (boxH + 4);

    doc.setDrawColor(156, 163, 175);
    doc.setLineDashPattern([1, 1], 0);
    doc.roundedRect(x, baseY, boxW, 20, 2, 2, 'S');
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_THEME.colors.muted);
    doc.text(signature.label.toUpperCase(), x + 4, baseY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_THEME.colors.text);
    if (signature.image && signature.image.startsWith('data:image')) {
      try {
        doc.addImage(signature.image, 'PNG', x + 4, baseY + 7, boxW - 8, 9);
      } catch {
        doc.text('ASSINATURA', x + 4, baseY + 12);
      }
    } else {
      doc.text('ASSINATURA', x + 4, baseY + 12);
    }

    doc.setFontSize(7);
    doc.text(`Nome: ${sanitize(signature.name)}`, x + 1, baseY + 25);
    doc.text(`Cargo: ${sanitize(signature.role)}`, x + 1, baseY + 29);
    doc.text(`Data: ${sanitize(signature.date)}`, x + 1, baseY + 33);
  });

  return y + height + 6;
}

export async function drawValidationCard(doc: PdfDoc, y: number, code: string, validationUrl?: string): Promise<number> {
  const url = validationUrl || buildValidationUrl(code);
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 256,
    color: {
      dark: '#1F2937',
      light: '#FFFFFF',
    },
  });

  const height = 34;
  y = ensurePageSpace(doc, y, height + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_THEME.colors.border);
  doc.roundedRect(PDF_THEME.margin, y, PDF_THEME.contentWidth, height, 3, 3, 'FD');
  drawCardTitle(doc, 'Validação do documento', PDF_THEME.margin, y);

  doc.addImage(qrDataUrl, 'PNG', PDF_THEME.margin + 4, y + 12, 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.colors.text);
  doc.text('Validar autenticidade do documento pelo QR Code ou pelo identificador abaixo:', PDF_THEME.margin + 30, y + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(code, PDF_THEME.margin + 30, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_THEME.colors.accent);
  doc.text(url.slice(0, 68), PDF_THEME.margin + 30, y + 30);

  return y + height + 6;
}

export function applyFooter(doc: PdfDoc, options: FooterOptions) {
  const pages = doc.getNumberOfPages();
  const generatedAt = options.generatedAt || formatDateTime(new Date().toISOString());
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_THEME.colors.border);
    doc.line(PDF_THEME.margin, 286, PDF_THEME.pageWidth - PDF_THEME.margin, 286);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_THEME.colors.muted);
    doc.text('Sistema ComplianceX SST', PDF_THEME.margin, 290);
    doc.text(`Gerado automaticamente em ${generatedAt}`, PDF_THEME.margin, 294);
    doc.text(`ID: ${options.code}`, PDF_THEME.pageWidth - PDF_THEME.margin, 290, { align: 'right' });
    doc.text(`Página ${page} de ${pages}`, PDF_THEME.pageWidth - PDF_THEME.margin, 294, { align: 'right' });
  }
}

export function buildPdfFilename(prefix: string, title: string, date?: string | null): string {
  const safeTitle = slugify(title || prefix).slice(0, 32) || prefix;
  const safeDate = formatDate(date).replace(/\//g, '-');
  return `${prefix}_${safeTitle}_${safeDate}.pdf`;
}
