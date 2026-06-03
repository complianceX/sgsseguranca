import { resolveGovernedPdfConsumption } from './governedPdfFallback';

describe('resolveGovernedPdfConsumption', () => {
  it('prioriza a URL governada quando o PDF final está pronto', () => {
    expect(
      resolveGovernedPdfConsumption(
        {
          hasFinalPdf: true,
          availability: 'ready',
          url: 'https://example.com/final.pdf',
          message: null,
        },
        {
          action: 'download',
          documentLabel: 'auditoria',
        },
      ),
    ).toEqual({
      mode: 'governed_url',
      url: 'https://example.com/final.pdf',
    });
  });

  it('troca impressão do PDF oficial por fallback local quando o acesso é attachment restrito', () => {
    expect(
      resolveGovernedPdfConsumption(
        {
          hasFinalPdf: true,
          availability: 'ready',
          url: '/storage/download/token',
          message: null,
        },
        {
          action: 'print',
          documentLabel: 'APR',
        },
      ),
    ).toEqual({
      mode: 'local_fallback',
      message:
        'PDF oficial da APR disponível apenas por download restrito. Gerando versão local temporária para impressão.',
    });
  });

  it('orienta fallback local explícito quando o PDF final existe sem signed URL', () => {
    expect(
      resolveGovernedPdfConsumption(
        {
          hasFinalPdf: true,
          availability: 'registered_without_signed_url',
          url: null,
          message: null,
        },
        {
          action: 'print',
          documentLabel: 'inspeção',
        },
      ),
    ).toEqual({
      mode: 'local_fallback',
      message:
        'PDF final da inspeção emitido, mas indisponível no armazenamento. Gerando versão local temporária para impressão.',
    });
  });

  it('gera mensagem explícita quando o PDF final ainda não foi emitido', () => {
    expect(
      resolveGovernedPdfConsumption(
        {
          hasFinalPdf: false,
          availability: 'not_emitted',
          url: null,
          message: null,
        },
        {
          action: 'download',
          documentLabel: 'checklist',
        },
      ),
    ).toEqual({
      mode: 'local_generation',
      message:
        'PDF final da checklist ainda não foi emitido. Gerando versão local para download.',
    });
  });
});
