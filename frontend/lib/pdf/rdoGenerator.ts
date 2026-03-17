import type { Rdo } from '@/services/rdosService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  buildPdfFilename,
  formatDateTime,
  sanitize,
} from '@/lib/pdf-system';

type PdfOptions = {
  save?: boolean;
  output?: 'base64';
};

type ParsedSignature = {
  nome?: string;
  cpf?: string;
  signed_at?: string;
};

function parseSignature(raw?: string): ParsedSignature | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedSignature;
    return parsed;
  } catch {
    return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return sanitize(value);
  }
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTimeSafe(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return sanitize(value);
  }
  return parsed.toLocaleString('pt-BR');
}

function buildClimateLabel(value?: string | null) {
  const labels: Record<string, string> = {
    ensolarado: 'Ensolarado',
    nublado: 'Nublado',
    chuvoso: 'Chuvoso',
    parcialmente_nublado: 'Parcialmente nublado',
  };
  return sanitize(labels[value || ''] || value || '-');
}

function parseRdoDocumentDate(value?: string | Date | null): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const looksLikeDateColumn =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;

    if (looksLikeDateColumn) {
      return new Date(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      );
    }

    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function getIsoYear(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  return target.getUTCFullYear();
}

function getIsoWeekNumber(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function buildRdoDocumentCode(
  reference?: string | number | null,
  dateValue?: string | Date | null,
): string {
  const documentDate = parseRdoDocumentDate(dateValue);
  const ref = sanitize(reference)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();

  return `RDO-${getIsoYear(documentDate)}-${String(
    getIsoWeekNumber(documentDate),
  ).padStart(2, '0')}-${ref || `${Date.now()}`.slice(-8)}`;
}

export async function generateRdoPdf(
  rdo: Rdo,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildRdoDocumentCode(rdo.id || rdo.numero, rdo.data);
  const filename = buildPdfFilename(
    'RDO',
    sanitize(rdo.numero || code),
    rdo.data,
  );

  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const headerHeight = 28;
  const footerHeight = 12;
  const topY = marginX + headerHeight;

  const ensureSpace = (requiredHeight: number, currentY: number) => {
    if (currentY + requiredHeight <= pageHeight - footerHeight - 8) {
      return currentY;
    }
    doc.addPage();
    return topY;
  };

  const drawSectionTitle = (title: string, currentY: number) => {
    const nextY = ensureSpace(10, currentY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(32, 68, 53);
    doc.text(title.toUpperCase(), marginX, nextY);
    return nextY + 4;
  };

  const drawParagraph = (title: string, content: string, currentY: number) => {
    let nextY = drawSectionTitle(title, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 55, 72);
    const lines = doc.splitTextToSize(sanitize(content || '-'), pageWidth - marginX * 2);
    nextY = ensureSpace(lines.length * 5 + 4, nextY);
    doc.text(lines, marginX, nextY);
    return nextY + lines.length * 5 + 4;
  };

  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(22, 78, 55);
    doc.roundedRect(marginX, 10, pageWidth - marginX * 2, 20, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('RELATORIO DIARIO DE OBRA', marginX + 4, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Empresa: ${sanitize(rdo.company?.razao_social || rdo.company_id || '-')}`,
      marginX + 4,
      23,
    );
    doc.text(
      `Obra/Site: ${sanitize(rdo.site?.nome || '-')}`,
      marginX + 4,
      27,
    );
    doc.text(`Codigo: ${code}`, pageWidth - marginX - 4, 18, { align: 'right' });
    doc.text(
      `Data: ${formatDate(rdo.data)}  |  Pagina ${pageNumber}/${totalPages}`,
      pageWidth - marginX - 4,
      23,
      { align: 'right' },
    );
    doc.text(
      `Gerado em ${formatDateTime(new Date().toISOString())}`,
      pageWidth - marginX - 4,
      27,
      { align: 'right' },
    );
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    doc.setDrawColor(185, 196, 208);
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(94, 109, 128);
    doc.text(`Validacao publica: /verify?code=${code}`, marginX, pageHeight - 9);
    doc.text(
      `GST - pagina ${pageNumber}/${totalPages}`,
      pageWidth - marginX,
      pageHeight - 9,
      { align: 'right' },
    );
  };

  let y = topY;

  autoTable(doc, {
    startY: y,
    margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [32, 39, 49] },
    headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 34, fontStyle: 'bold' },
      2: { cellWidth: 34, fontStyle: 'bold' },
    },
    body: [
      [
        'Numero',
        sanitize(rdo.numero || '-'),
        'Status',
        sanitize((rdo.status || 'rascunho').toUpperCase()),
      ],
      ['Data', formatDate(rdo.data), 'Responsavel', sanitize(rdo.responsavel?.nome || '-')],
      ['Clima manha', buildClimateLabel(rdo.clima_manha), 'Clima tarde', buildClimateLabel(rdo.clima_tarde)],
      [
        'Temperatura',
        rdo.temperatura_min != null || rdo.temperatura_max != null
          ? `${sanitize(rdo.temperatura_min ?? '-')}C a ${sanitize(rdo.temperatura_max ?? '-') }C`
          : '-',
        'Terreno',
        sanitize(rdo.condicao_terreno || '-'),
      ],
    ],
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 6;

  const laborRows = (rdo.mao_de_obra || []).map((item) => [
    sanitize(item.funcao),
    sanitize(item.quantidade),
    sanitize(item.turno),
    `${sanitize(item.horas)} h`,
  ]);
  if (laborRows.length > 0) {
    y = drawSectionTitle('Mao de obra', y);
    autoTable(doc, {
      startY: y,
      margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.3 },
      headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
      head: [['Funcao', 'Quantidade', 'Turno', 'Horas']],
      body: laborRows,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 5;
  }

  const equipmentRows = (rdo.equipamentos || []).map((item) => [
    sanitize(item.nome),
    sanitize(item.quantidade),
    sanitize(item.horas_trabalhadas),
    sanitize(item.horas_ociosas),
    sanitize(item.observacao || '-'),
  ]);
  if (equipmentRows.length > 0) {
    y = drawSectionTitle('Equipamentos', y);
    autoTable(doc, {
      startY: y,
      margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.3 },
      headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
      head: [['Equipamento', 'Qtd.', 'H. trabalhadas', 'H. ociosas', 'Observacao']],
      body: equipmentRows,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 5;
  }

  const materialRows = (rdo.materiais_recebidos || []).map((item) => [
    sanitize(item.descricao),
    sanitize(item.unidade),
    sanitize(item.quantidade),
    sanitize(item.fornecedor || '-'),
  ]);
  if (materialRows.length > 0) {
    y = drawSectionTitle('Materiais recebidos', y);
    autoTable(doc, {
      startY: y,
      margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.3 },
      headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
      head: [['Descricao', 'Unidade', 'Quantidade', 'Fornecedor']],
      body: materialRows,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 5;
  }

  const serviceRows = (rdo.servicos_executados || []).map((item) => [
    sanitize(item.descricao),
    `${sanitize(item.percentual_concluido)}%`,
    sanitize(item.observacao || '-'),
  ]);
  if (serviceRows.length > 0) {
    y = drawSectionTitle('Servicos executados', y);
    autoTable(doc, {
      startY: y,
      margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.3 },
      headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
      head: [['Servico', '% concluido', 'Observacao']],
      body: serviceRows,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 5;
  }

  const occurrenceRows = (rdo.ocorrencias || []).map((item) => [
    sanitize(item.tipo),
    sanitize(item.descricao),
    sanitize(item.hora || '-'),
  ]);
  if (occurrenceRows.length > 0) {
    y = drawSectionTitle('Ocorrencias', y);
    autoTable(doc, {
      startY: y,
      margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.3 },
      headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
      head: [['Tipo', 'Descricao', 'Hora']],
      body: occurrenceRows,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 5;
  }

  if (rdo.houve_acidente || rdo.houve_paralisacao) {
    y = drawParagraph(
      'Sinalizadores operacionais',
      [
        rdo.houve_acidente ? 'Houve acidente registrado neste RDO.' : null,
        rdo.houve_paralisacao
          ? `Houve paralisacao. Motivo: ${sanitize(rdo.motivo_paralisacao || 'Nao informado')}`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      y,
    );
  }

  if (rdo.observacoes) {
    y = drawParagraph('Observacoes gerais', rdo.observacoes, y);
  }

  if (rdo.programa_servicos_amanha) {
    y = drawParagraph(
      'Programa de servicos para amanha',
      rdo.programa_servicos_amanha,
      y,
    );
  }

  const responsavelSignature = parseSignature(rdo.assinatura_responsavel);
  const engineerSignature = parseSignature(rdo.assinatura_engenheiro);
  y = drawSectionTitle('Assinaturas', y);
  autoTable(doc, {
    startY: y,
    margin: { top: topY, left: marginX, right: marginX, bottom: footerHeight + 6 },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [230, 239, 233], textColor: [24, 54, 42], fontStyle: 'bold' },
    head: [['Funcao', 'Nome', 'CPF', 'Assinado em']],
    body: [
      [
        'Responsavel pela obra',
        sanitize(responsavelSignature?.nome || '-'),
        sanitize(responsavelSignature?.cpf || '-'),
        formatDateTimeSafe(responsavelSignature?.signed_at),
      ],
      [
        'Engenheiro responsavel',
        sanitize(engineerSignature?.nome || '-'),
        sanitize(engineerSignature?.cpf || '-'),
        formatDateTimeSafe(engineerSignature?.signed_at),
      ],
    ],
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawHeader(page, totalPages);
    drawFooter(page, totalPages);
  }

  if (options?.save === false && options?.output === 'base64') {
    const output = doc as unknown as {
      output: (type: 'datauri' | 'dataurl') => string;
    };
    return { base64: pdfDocToBase64(output), filename };
  }

  doc.save(filename);
}
