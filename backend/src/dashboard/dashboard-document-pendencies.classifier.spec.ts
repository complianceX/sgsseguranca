import {
  getDocumentModuleLabel,
  getDocumentPendencyCriticalityWeight,
  getDocumentPendencyTypeLabel,
  resolveDocumentPendencyCriticality,
} from './dashboard-document-pendencies.classifier';

describe('dashboard-document-pendencies.classifier', () => {
  it('classifies dead-letter imports as critical', () => {
    expect(
      resolveDocumentPendencyCriticality({
        type: 'failed_import',
        module: 'document-import',
        status: 'DEAD_LETTER',
      }),
    ).toBe('critical');
  });

  it('classifies approved RDO missing signature as critical', () => {
    expect(
      resolveDocumentPendencyCriticality({
        type: 'missing_required_signature',
        module: 'rdo',
        status: 'aprovado',
      }),
    ).toBe('critical');
  });

  it('classifies APR without final PDF as critical', () => {
    expect(
      resolveDocumentPendencyCriticality({
        type: 'missing_final_pdf',
        module: 'apr',
        status: 'Aprovada',
      }),
    ).toBe('critical');
  });

  it('exposes stable labels and weights', () => {
    expect(getDocumentPendencyTypeLabel('unavailable_governed_video')).toBe(
      'Vídeo governado indisponível',
    );
    expect(getDocumentModuleLabel('inspection')).toBe('Relatório de inspeção');
    expect(getDocumentPendencyCriticalityWeight('high')).toBeGreaterThan(
      getDocumentPendencyCriticalityWeight('medium'),
    );
  });
});
