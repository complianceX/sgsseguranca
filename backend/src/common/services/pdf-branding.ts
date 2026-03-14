import { jsPDF } from 'jspdf';

export const backendPdfTheme = {
  navy: [16, 32, 51] as [number, number, number],
  blue: [31, 78, 121] as [number, number, number],
  teal: [15, 118, 110] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  softText: [221, 229, 238] as [number, number, number],
};

type HeaderOptions = {
  title: string;
  subtitle?: string;
  metaRight?: string[];
  marginX?: number;
};

export function drawBackendPdfHeader(doc: jsPDF, options: HeaderOptions) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = options.marginX ?? 16;

  doc.setFillColor(...backendPdfTheme.navy);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setFillColor(...backendPdfTheme.blue);
  doc.rect(0, 30, pageWidth, 2.4, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(options.title, marginX, 14);

  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(...backendPdfTheme.softText);
    doc.text(options.subtitle, marginX, 20);
  }

  if (options.metaRight?.length) {
    let rightY = 14;
    doc.setFontSize(8.5);
    doc.setTextColor(...backendPdfTheme.softText);
    for (const line of options.metaRight) {
      doc.text(line, pageWidth - marginX, rightY, { align: 'right' });
      rightY += 5;
    }
  }
}

export function createBackendPdfTableTheme() {
  return {
    theme: 'grid' as const,
    styles: {
      fontSize: 8.5,
      lineColor: backendPdfTheme.border,
      lineWidth: 0.18,
      cellPadding: 3,
      textColor: backendPdfTheme.text,
    },
    headStyles: {
      fillColor: backendPdfTheme.navy,
      textColor: 255,
      fontStyle: 'bold' as const,
    },
    alternateRowStyles: {
      fillColor: backendPdfTheme.surface,
    },
  };
}

export function drawBackendSectionTitle(
  doc: jsPDF,
  y: number,
  title: string,
  marginX = 16,
) {
  doc.setFillColor(...backendPdfTheme.surface);
  doc.setDrawColor(...backendPdfTheme.border);
  doc.roundedRect(marginX, y - 5, 178, 10, 2, 2, 'FD');
  doc.setFillColor(...backendPdfTheme.teal);
  doc.rect(marginX, y - 5, 2.5, 10, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...backendPdfTheme.text);
  doc.text(title, marginX + 6, y + 1.8);
}

export function applyBackendPdfFooter(
  doc: jsPDF,
  options?: {
    marginX?: number;
    systemLabel?: string;
  },
) {
  const marginX = options?.marginX ?? 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...backendPdfTheme.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    doc.setFontSize(7);
    doc.setTextColor(...backendPdfTheme.muted);
    doc.text(
      options?.systemLabel || 'Sistema <GST> Gestão de Segurança do Trabalho',
      marginX,
      pageHeight - 8,
    );
    doc.text(`Página ${page} de ${pages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }
}

export function getBackendLastTableY(doc: jsPDF, fallback = 120): number {
  return (doc as any).lastAutoTable?.finalY || fallback;
}
