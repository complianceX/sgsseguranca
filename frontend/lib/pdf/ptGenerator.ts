import type { Pt } from '@/services/ptsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildValidationUrl,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawModernTable,
  drawSignatureCard,
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from './pdfLayout';

type PdfOptions = { save?: boolean; output?: 'base64' };

function checkbox(value: boolean): string {
  return value ? 'Sim' : 'Não';
}

export async function generatePtPdf(
  pt: Pt,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildDocumentCode('PT', pt.id || pt.numero || pt.titulo);
  let y = drawHeader(doc, {
    title: 'PERMISSÃO DE TRABALHO',
    subtitle: 'PT - Segurança do Trabalho',
    date: formatDate(pt.data_hora_inicio),
    code,
    logoText: 'GST',
  });

  y = drawBadge(doc, y, 'Status da PT', sanitize(pt.status), pt.status === 'Aprovada' ? 'accent' : 'secondary');
  y = drawInfoCard(doc, y, 'Informações da PT', [
    { label: 'Número', value: sanitize(pt.numero) },
    { label: 'Título', value: sanitize(pt.titulo) },
    { label: 'Responsável', value: sanitize(pt.responsavel?.nome) },
    { label: 'Site / Obra', value: sanitize(pt.site?.nome) },
    { label: 'Início', value: formatDate(pt.data_hora_inicio) },
    { label: 'Fim', value: formatDate(pt.data_hora_fim) },
  ]);

  y = drawInfoCard(doc, y, 'Tipos de trabalho', [
    { label: 'Altura', value: checkbox(!!pt.trabalho_altura) },
    { label: 'Espaço confinado', value: checkbox(!!pt.espaco_confinado) },
    { label: 'Trabalho a quente', value: checkbox(!!pt.trabalho_quente) },
    { label: 'Eletricidade', value: checkbox(!!pt.eletricidade) },
    { label: 'Escavação', value: checkbox(!!pt.escavacao) },
  ], 3);
  y = drawTextCard(doc, y, 'Descrição da atividade', pt.descricao);

  if (pt.executantes?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      `Executantes (${pt.executantes.length})`,
      [['#', 'Nome']],
      pt.executantes.map((executor, index) => [index + 1, sanitize(executor.nome)]),
      { columnStyles: { 0: { cellWidth: 12 } } },
    );
  }

  const checklists: [string, typeof pt.trabalho_altura_checklist][] = [
    ['Trabalho em Altura', pt.trabalho_altura_checklist],
    ['Trabalho Elétrico', pt.trabalho_eletrico_checklist],
    ['Trabalho a Quente', pt.trabalho_quente_checklist],
    ['Espaço Confinado', pt.trabalho_espaco_confinado_checklist],
    ['Escavação', pt.trabalho_escavacao_checklist],
  ];

  for (const [title, items] of checklists) {
    if (!items?.length) continue;
    y = drawModernTable(
      doc,
      autoTable,
      y,
      title,
      [['Pergunta', 'Resposta', 'Justificativa']],
      items.map((item) => [
        sanitize(item.pergunta),
        sanitize(item.resposta),
        sanitize(item.justificativa),
      ]),
      {
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 25 } },
      },
    );
  }

  y = drawSignatureCard(
    doc,
    y,
    signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
  );

  await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = `PT_${sanitize(pt.numero || code)}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as { output: (type: 'datauri' | 'dataurl') => string };
    return { base64: pdfDocToBase64(docOutput), filename };
  }
  doc.save(filename);
}
