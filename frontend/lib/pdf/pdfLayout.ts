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

// ─── Paleta SST (alinhada com NR-26 e o design system do app) ─────────────────
export const PDF_THEME = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 14,
  contentWidth: 182,
  colors: {
    // Fundo da página — branco puro para melhor legibilidade
    pageBg:     [255, 255, 255] as Color,

    // Header — azul corporativo profundo
    headerBg:   [10,  22,  40]  as Color,   // #0a1628
    headerAccent:[15, 30, 58]   as Color,   // faixa interna do header

    // Identidade SST — azul corporativo como cor primária
    primary:    [ 37,  99, 235] as Color,   // #2563eb  blue-600
    primaryDark:[ 29,  78, 216] as Color,   // #1d4ed8  blue-700 (sombra)
    primaryBg:  [239, 246, 255] as Color,   // blue-50

    // Azul céu operacional — obras, equipamentos
    accent:     [ 14, 165, 233] as Color,   // #0ea5e9  sky-500
    accentBg:   [240, 249, 255] as Color,   // sky-50

    // Verde — saída de emergência, conforme, OK
    success:    [ 21, 128,  61] as Color,   // #15803d  green-700
    successBg:  [240, 253, 244] as Color,   // green-50

    // Vermelho — perigo, interdição, emergência
    danger:     [185,  28,  28] as Color,   // #b91c1c  red-700
    dangerBg:   [254, 242, 242] as Color,   // red-50

    // Amarelo — atenção, manutenção
    warning:    [161, 113,  12] as Color,   // #a1710c  yellow-700
    warningBg:  [254, 252, 232] as Color,   // yellow-50

    // Tipografia
    text:       [ 15,  23,  42] as Color,   // #0f172a  slate-900 (máxima legibilidade)
    textSecond: [ 51,  65,  85] as Color,   // #334155  slate-700
    muted:      [100, 116, 139] as Color,   // #64748b  slate-500

    // Superfícies
    cardBg:     [255, 255, 255] as Color,
    sectionBg:  [248, 250, 252] as Color,   // slate-50
    stripeBg:   [241, 245, 249] as Color,   // slate-100

    // Bordas
    border:     [203, 213, 225] as Color,   // slate-300
    borderLight:[226, 232, 240] as Color,   // slate-200
  },
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

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
  const origin = typeof window !== 'undefined' ? window.location.origin : envUrl || 'https://gst-sst.app';
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
  drawPageBackground(doc);
  return top;
}

export function drawPageBackground(doc: PdfDoc) {
  doc.setFillColor(...PDF_THEME.colors.pageBg);
  doc.rect(0, 0, PDF_THEME.pageWidth, PDF_THEME.pageHeight, 'F');
}

// ─── Header ───────────────────────────────────────────────────────────────────
// Layout:
//  ┌──────────────────────────────────────────────────────────────┐
//  │ [GST] TÍTULO DO DOCUMENTO            ┌──────────────────┐   │
//  │        SUBTÍTULO                     │  ID DO DOCUMENTO │   │
//  │        Data: dd/mm/yyyy              │  CODE            │   │
//  │                                      └──────────────────┘   │
//  ├── faixa âmbar ───────────────────────────────────────────────┤

export function drawHeader(doc: PdfDoc, options: HeaderOptions): number {
  const { margin, pageWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  // Fundo do header
  doc.setFillColor(...T.headerBg);
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Faixa âmbar inferior do header (identidade SST)
  doc.setFillColor(...T.primary);
  doc.rect(0, 36, pageWidth, 3, 'F');

  // Logo badge — quadrado arredondado âmbar
  doc.setFillColor(...T.primary);
  doc.roundedRect(margin, 7, 22, 22, 3, 3, 'F');
  doc.setTextColor(...T.headerBg);
  doc.setFont('helvetica', 'bold');
  const logoText = options.logoText || 'GST';
  const logoFontSize = logoText.length > 2 ? 10 : 13;
  doc.setFontSize(logoFontSize);
  doc.text(logoText, margin + 11, 21, { align: 'center' });

  // Título e subtítulo
  const textX = margin + 27;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(options.title, textX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(options.subtitle, textX, 21);
  doc.text(`Data: ${sanitize(options.date)}`, textX, 27);

  // Rodape do header — "<GST> Gestao de Seguranca do Trabalho"
  doc.setFontSize(7);
  doc.setTextColor(...T.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('<GST>  ·  GESTAO DE SEGURANCA DO TRABALHO', textX, 33);

  // Box do código do documento
  const boxW = 52;
  const boxX = pageWidth - margin - boxW;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(boxX, 8, boxW, 20, 2, 2, 'F');

  // Faixa âmbar no topo do box
  doc.setFillColor(...T.primary);
  doc.roundedRect(boxX, 8, boxW, 6, 2, 2, 'F');
  doc.rect(boxX, 11, boxW, 3, 'F'); // corta bordas inferiores da faixa

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...T.headerBg);
  doc.text('ID DO DOCUMENTO', boxX + boxW / 2, 12.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...T.headerBg);
  doc.text(options.code, boxX + boxW / 2, 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...T.muted);
  doc.text('GST', boxX + boxW / 2, 26, { align: 'center' });

  // Fundo da área de conteúdo
  drawPageBackground(doc);
  // Reaplica a faixa âmbar (ficou sobre o bg branco)
  doc.setFillColor(...T.primary);
  doc.rect(0, 36, pageWidth, 3, 'F');

  return 46;
}

// ─── Seção / título de card ────────────────────────────────────────────────────
function drawSectionTitle(doc: PdfDoc, title: string, x: number, y: number, width: number) {
  const T = PDF_THEME.colors;
  // Faixa de título âmbar tênue
  doc.setFillColor(...T.primaryBg);
  doc.roundedRect(x, y, width, 9, 2, 2, 'F');
  // Borda esquerda âmbar forte
  doc.setFillColor(...T.primary);
  doc.rect(x, y, 3, 9, 'F');

  doc.setTextColor(...T.headerBg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), x + 7, y + 6.2);
}

// Mantém compatibilidade com calls existentes em outros generators
export function drawCardTitle(doc: PdfDoc, title: string, x: number, y: number) {
  drawSectionTitle(doc, title, x, y, PDF_THEME.contentWidth);
}

// ─── Info Card ────────────────────────────────────────────────────────────────
export function drawInfoCard(
  doc: PdfDoc,
  y: number,
  title: string,
  fields: InfoField[],
  columns = 2,
): number {
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;
  const rows = Math.max(1, Math.ceil(fields.length / columns));
  const titleH = 10;
  const rowH = 11;
  const height = titleH + rows * rowH + 4;
  y = ensurePageSpace(doc, y, height + 6);

  // Card background
  doc.setFillColor(...T.cardBg);
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, height, 3, 3, 'FD');

  drawSectionTitle(doc, title, margin, y, contentWidth);

  const colW = contentWidth / columns;
  fields.forEach((field, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const baseX = margin + col * colW + 5;
    const baseY = y + titleH + 4 + row * rowH;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...T.muted);
    doc.text(field.label.toUpperCase(), baseX, baseY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...T.text);
    doc.text(String(field.value).slice(0, 44), baseX, baseY + 5.5);
  });

  return y + height + 5;
}

// ─── Badge de tema (banner horizontal) ───────────────────────────────────────
export function drawBadge(
  doc: PdfDoc,
  y: number,
  label: string,
  value: string,
  tone: 'accent' | 'secondary' | 'danger' = 'accent',
): number {
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  // Mapeia o tom para as cores SST
  const bgColor: Color =
    tone === 'danger' ? T.danger :
    tone === 'secondary' ? T.primary :
    T.accent;

  y = ensurePageSpace(doc, y, 14);

  // Banner de largura total
  doc.setFillColor(...bgColor);
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');

  // Ícone de segurança (triângulo ou shield — aproximamos com texto)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`${label.toUpperCase()}:`, margin + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const labelWidth = doc.getTextWidth(`${label.toUpperCase()}: `);
  const maxValueW = contentWidth - labelWidth - 12;
  const valueText = value.length > 80 ? `${value.slice(0, 80)}…` : value;
  doc.text(valueText, margin + 5 + labelWidth + 1, y + 8, { maxWidth: maxValueW });

  return y + 16;
}

// ─── Card de texto livre ──────────────────────────────────────────────────────
export function drawTextCard(doc: PdfDoc, y: number, title: string, content?: string | null): number {
  if (!content) return y;
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  const lines: string[] = doc.splitTextToSize(String(content), contentWidth - 10);
  const titleH = 10;
  const lineH = 5;
  const height = Math.max(28, titleH + lines.length * lineH + 6);
  y = ensurePageSpace(doc, y, height + 6);

  doc.setFillColor(...T.cardBg);
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, height, 3, 3, 'FD');

  drawSectionTitle(doc, title, margin, y, contentWidth);

  doc.setTextColor(...T.text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(lines, margin + 5, y + titleH + 5);

  return y + height + 5;
}

// ─── Tabela moderna (participantes, itens, etc.) ──────────────────────────────
export function drawModernTable(
  doc: PdfDoc,
  autoTable: AutoTableFn,
  y: number,
  title: string,
  head: string[][],
  body: (string | number)[][],
  overrides?: Record<string, unknown>,
): number {
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  y = ensurePageSpace(doc, y, 28);

  // Título acima da tabela
  doc.setFillColor(...T.cardBg);
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 10, 3, 3, 'FD');
  drawSectionTitle(doc, title, margin, y, contentWidth);

  autoTable(doc, {
    startY: y + 11,
    margin: { left: margin, right: margin },
    head,
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      textColor: T.text,
      lineColor: T.borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: T.headerBg,
      textColor: [147, 197, 253],   // blue-300 — contraste máximo sobre dark
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: T.stripeBg,
    },
    bodyStyles: {
      fillColor: T.cardBg,
      fontSize: 9,
    },
    ...overrides,
  });

  return ((doc as any).lastAutoTable?.finalY || y + 20) + 8;
}

// ─── Card de assinaturas digitais ─────────────────────────────────────────────
export function drawSignatureCard(doc: PdfDoc, y: number, signatures: SignatureField[]): number {
  if (!signatures.length) return y;
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  const columns = 2;
  const boxW = (contentWidth - 8) / columns;
  const boxH = 42;
  const titleH = 10;
  const rows = Math.ceil(signatures.length / columns);
  const height = titleH + rows * (boxH + 5) + 4;
  y = ensurePageSpace(doc, y, height + 6);

  doc.setFillColor(...T.cardBg);
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, height, 3, 3, 'FD');
  drawSectionTitle(doc, 'Assinaturas Digitais', margin, y, contentWidth);

  signatures.forEach((sig, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = margin + 4 + col * (boxW + 4);
    const baseY = y + titleH + 4 + row * (boxH + 5);

    // Box da assinatura — borda tracejada discreta
    doc.setFillColor(...T.sectionBg);
    doc.setDrawColor(...T.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, baseY, boxW, 24, 2, 2, 'FD');

    // Label do tipo de assinatura
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...T.muted);
    doc.text(sig.label.toUpperCase().slice(0, 28), x + 3, baseY + 5);

    // Imagem ou placeholder
    if (sig.image && sig.image.startsWith('data:image')) {
      try {
        doc.addImage(sig.image, 'PNG', x + 3, baseY + 7, boxW - 6, 13);
      } catch {
        _drawSignaturePlaceholder(doc, x, baseY, boxW, T);
      }
    } else {
      _drawSignaturePlaceholder(doc, x, baseY, boxW, T);
    }

    // Dados do assinante abaixo do box
    const infoY = baseY + 27;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...T.text);
    doc.text(sanitize(sig.name).slice(0, 30), x + 1, infoY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...T.textSecond);
    doc.text(`Cargo: ${sanitize(sig.role).slice(0, 24)}`, x + 1, infoY + 5);
    doc.text(`Data: ${sanitize(sig.date)}`, x + 1, infoY + 10);
  });

  return y + height + 5;
}

function _drawSignaturePlaceholder(doc: PdfDoc, x: number, baseY: number, boxW: number, T: typeof PDF_THEME.colors) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...T.muted);
  doc.text('ASSINATURA', x + boxW / 2, baseY + 16, { align: 'center' });
}

// ─── Card de validação / QR Code ──────────────────────────────────────────────
export async function drawValidationCard(
  doc: PdfDoc,
  y: number,
  code: string,
  validationUrl?: string,
): Promise<number> {
  const url = validationUrl || buildValidationUrl(code);
  const { margin, contentWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 256,
    color: {
      dark: '#0a1628',
      light: '#FFFFFF',
    },
  });

  const height = 38;
  y = ensurePageSpace(doc, y, height + 6);

  doc.setFillColor(...T.cardBg);
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, height, 3, 3, 'FD');
  drawSectionTitle(doc, 'Validação do Documento', margin, y, contentWidth);

  // QR Code
  doc.addImage(qrDataUrl, 'PNG', margin + 5, y + 13, 22, 22);

  // Separador vertical
  doc.setDrawColor(...T.borderLight);
  doc.setLineWidth(0.3);
  doc.line(margin + 31, y + 13, margin + 31, y + 35);

  // Textos de validação
  const textX = margin + 36;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...T.textSecond);
  doc.text('Escaneie o QR Code ou use o identificador para validar a autenticidade:', textX, y + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...T.text);
  doc.text(code, textX, y + 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...T.accent);
  doc.text(url.slice(0, 72), textX, y + 31);

  // Ícone de verificado (círculo verde + check)
  doc.setFillColor(...T.success);
  doc.circle(margin + contentWidth - 10, y + 24, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('✓', margin + contentWidth - 10, y + 26.5, { align: 'center' });

  return y + height + 6;
}

// ─── Footer ───────────────────────────────────────────────────────────────────
export function applyFooter(doc: PdfDoc, options: FooterOptions) {
  const pages = doc.getNumberOfPages();
  const generatedAt = options.generatedAt || formatDateTime(new Date().toISOString());
  const { margin, pageWidth } = PDF_THEME;
  const T = PDF_THEME.colors;

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);

    // Faixa âmbar inferior (continuidade com o header)
    doc.setFillColor(...T.primary);
    doc.rect(0, 283, pageWidth, 1.5, 'F');

    // Linha divisória
    doc.setDrawColor(...T.borderLight);
    doc.setLineWidth(0.2);
    doc.line(margin, 285, pageWidth - margin, 285);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...T.headerBg);
    doc.text('Sistema <GST> Gestao de Seguranca do Trabalho', margin, 290);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...T.muted);
    doc.text(`Gerado automaticamente em ${generatedAt}`, margin, 294);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...T.textSecond);
    doc.text(`ID: ${options.code}`, pageWidth - margin, 290, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...T.muted);
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, 294, { align: 'right' });
  }
}

// ─── Helpers de arquivo ────────────────────────────────────────────────────────
export function buildPdfFilename(prefix: string, title: string, date?: string | null): string {
  const safeTitle = slugify(title || prefix).slice(0, 32) || prefix;
  const safeDate = formatDate(date).replace(/\//g, '-');
  return `${prefix}_${safeTitle}_${safeDate}.pdf`;
}
