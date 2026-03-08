import type { Training } from '@/services/trainingsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawSignatureCard,
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from './pdfLayout';

type PdfOptions = { save?: boolean; output?: 'base64' };

export async function generateTrainingPdf(
  training: Training,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildDocumentCode('TRN', (training as any).id || training.nr_codigo || training.nome);
  const expiryDate = training.data_vencimento ? new Date(training.data_vencimento) : null;
  const now = new Date();
  const isExpired = expiryDate ? expiryDate.getTime() < now.getTime() : false;
  const remainingDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;

  let y = drawHeader(doc, {
    title: 'COMPROVANTE DE TREINAMENTO',
    subtitle: 'Registro de qualificação e validade',
    date: formatDate(training.data_conclusao),
    code,
    logoText: 'CX',
  });

  y = drawBadge(
    doc,
    y,
    'Status do treinamento',
    isExpired ? 'Vencido' : remainingDays !== null && remainingDays <= 30 ? `Vence em ${remainingDays} dias` : 'Válido',
    isExpired ? 'danger' : remainingDays !== null && remainingDays <= 30 ? 'secondary' : 'accent',
  );

  y = drawInfoCard(doc, y, 'Informações do treinamento', [
    { label: 'Treinamento', value: sanitize(training.nome) },
    { label: 'Colaborador', value: sanitize(training.user?.nome) },
    { label: 'NR / Código', value: sanitize(training.nr_codigo) },
    { label: 'Carga horária', value: training.carga_horaria ? `${training.carga_horaria}h` : '-' },
    { label: 'Conclusão', value: formatDate(training.data_conclusao) },
    { label: 'Vencimento', value: formatDate(training.data_vencimento) },
    { label: 'Obrigatório', value: training.obrigatorio_para_funcao ? 'Sim' : 'Não' },
  ]);

  y = drawTextCard(doc, y, 'Certificado / referência', training.certificado_url);

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

  const filename = buildPdfFilename('TREINAMENTO', `${training.nome}_${training.user?.nome ?? 'colaborador'}`, training.data_conclusao);
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
