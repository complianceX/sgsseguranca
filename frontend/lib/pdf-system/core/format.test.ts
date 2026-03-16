import { buildDocumentCode } from './format';

describe('buildDocumentCode', () => {
  it('usa a data documental quando informada', () => {
    expect(
      buildDocumentCode(
        'CHK',
        '12345678-1234-1234-1234-abcdef123456',
        '2025-12-30',
      ),
    ).toBe('CHK-2025-EF123456');
  });

  it('mantem fallback para o ano atual quando a data e invalida', () => {
    const currentYear = new Date().getFullYear();

    expect(
      buildDocumentCode('CHK', 'abc-123456', 'data-invalida'),
    ).toBe(`CHK-${currentYear}-BC123456`);
  });
});
