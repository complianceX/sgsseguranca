import type { Apr } from '@/services/aprsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildValidationUrl,
  createPdfDoc,
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

export async function generateAprPdf(
  apr: Apr,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  createPdfDoc();
  const code = buildDocumentCode('APR', (apr as any).id || apr.numero || apr.titulo);
  let y = drawHeader(doc, {
    title: 'ANÁLISE PRELIMINAR DE RISCO',
    subtitle: `APR - Segurança do Trabalho`,
    date: formatDate(apr.data_inicio),
    code,
    logoText: 'CX',
  });

  y = drawBadge(doc, y, 'Tema / Atividade', sanitize(apr.titulo), 'accent');
  y = drawInfoCard(doc, y, 'Informações da APR', [
    { label: 'Número', value: sanitize(apr.numero) },
    { label: 'Versão', value: sanitize(apr.versao ?? 1) },
    { label: 'Site / Obra', value: sanitize(apr.site?.nome) },
    { label: 'Empresa', value: sanitize(apr.company?.razao_social) },
    { label: 'Elaborador', value: sanitize(apr.elaborador?.nome) },
    { label: 'Status', value: sanitize(apr.status) },
    { label: 'Data Início', value: formatDate(apr.data_inicio) },
    { label: 'Data Fim', value: formatDate(apr.data_fim) },
  ]);
  y = drawTextCard(doc, y, 'Descrição da atividade', apr.descricao);

  if (apr.risk_items?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      'Riscos e controles',
      [['#', 'Atividade', 'Perigo', 'P', 'S', 'Score', 'Categoria', 'Controles']],
      apr.risk_items.map((item, index) => [
        index + 1,
        sanitize(item.atividade),
        sanitize(item.agente_ambiental || item.condicao_perigosa),
        sanitize(item.probabilidade),
        sanitize(item.severidade),
        sanitize(item.score_risco),
        sanitize(item.categoria_risco),
        sanitize(item.medidas_prevencao),
      ]),
      {
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 26 },
          2: { cellWidth: 28 },
          3: { cellWidth: 9 },
          4: { cellWidth: 9 },
          5: { cellWidth: 11 },
          6: { cellWidth: 20 },
        },
      },
    );
  }

  if (apr.participants?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      `Participantes (${apr.participants.length})`,
      [['#', 'Nome']],
      apr.participants.map((participant, index) => [index + 1, sanitize(participant.nome)]),
      { columnStyles: { 0: { cellWidth: 12 } } },
    );
  }

  y = drawSignatureCard(
    doc,
    y,
    signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize((signature as any).user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
  );
  y = await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = `APR_${sanitize(apr.numero || code)}_v${apr.versao ?? 1}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
