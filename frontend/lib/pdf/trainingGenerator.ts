import type { Training } from '@/services/trainingsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';

type PdfOptions = { save?: boolean; output?: 'base64' };

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

function sanitize(text?: string | null): string {
  return text || '-';
}

export async function generateTrainingPdf(
  training: Training,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(67, 56, 202);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROVANTE DE TREINAMENTO', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (training.nr_codigo) {
    doc.text(sanitize(training.nr_codigo), pageW / 2, 22, { align: 'center' });
  }

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Training name
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(sanitize(training.nome), contentW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 4;

  // Metadata card
  const meta: [string, string][] = [
    ['Colaborador', sanitize(training.user?.nome)],
    ['NR / Código', sanitize(training.nr_codigo)],
    ['Carga Horária', training.carga_horaria ? `${training.carga_horaria}h` : '-'],
    ['Obrigatório', training.obrigatorio_para_funcao ? 'Sim' : 'Não'],
    ['Data Conclusão', formatDate(training.data_conclusao)],
    ['Data Vencimento', formatDate(training.data_vencimento)],
  ];

  const metaH = Math.ceil(meta.length / 2) * 7 + 6;
  doc.setFontSize(9);
  doc.setFillColor(238, 242, 255);
  doc.rect(margin, y, contentW, metaH, 'F');
  doc.setDrawColor(199, 210, 254);
  doc.rect(margin, y, contentW, metaH);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 3 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 56, 202);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 60), xBase + 28, yRow + 4);
  });
  y += metaH + 8;

  // Validity status banner
  const vencimento = new Date(training.data_vencimento);
  const hoje = new Date();
  const isExpired = vencimento < hoje;
  const diasRestantes = Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (isExpired) {
    doc.setFillColor(254, 226, 226);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.setTextColor(185, 28, 28);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`⚠ TREINAMENTO VENCIDO em ${formatDate(training.data_vencimento)}`, margin + 4, y + 6.5);
  } else if (diasRestantes <= 30) {
    doc.setFillColor(255, 251, 235);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`⚠ Vence em ${diasRestantes} dias (${formatDate(training.data_vencimento)})`, margin + 4, y + 6.5);
  } else {
    doc.setFillColor(220, 252, 231);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`✓ Válido até ${formatDate(training.data_vencimento)} (${diasRestantes} dias restantes)`, margin + 4, y + 6.5);
  }
  y += 16;

  // Certificado URL
  if (training.certificado_url) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 56, 202);
    doc.text('Certificado:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 100, 200);
    const urlText = training.certificado_url.substring(0, 80);
    doc.text(urlText, margin + 22, y);
    y += 8;
  }

  // Signatures
  if (signatures.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 56, 202);
    doc.text('Assinaturas', margin, y);
    y += 6;

    const sigPerRow = 3;
    const sigW = contentW / sigPerRow;
    signatures.forEach((sig, idx) => {
      const col = idx % sigPerRow;
      const xSig = margin + col * sigW;
      if (col === 0 && idx > 0) y += 30;
      if (y > 260) { doc.addPage(); y = margin; }
      try {
        if (sig.signature_data && sig.signature_data.startsWith('data:image')) {
          doc.addImage(sig.signature_data, 'PNG', xSig + 2, y, sigW - 8, 18);
        }
      } catch { /* skip */ }
      doc.setDrawColor(180, 180, 180);
      doc.line(xSig + 2, y + 20, xSig + sigW - 6, y + 20);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(sanitize(sig.type), xSig + 2, y + 24);
      doc.text(formatDate(sig.signed_at || sig.created_at), xSig + 2, y + 28);
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Treinamento: ${training.nome} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `Treinamento_${training.nome.replace(/\s+/g, '_').substring(0, 30)}_${training.user?.nome?.replace(/\s+/g, '_').substring(0, 20) ?? 'colaborador'}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
