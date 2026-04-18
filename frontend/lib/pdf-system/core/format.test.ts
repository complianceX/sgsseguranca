import { buildDocumentCode, buildValidationUrl, sanitize } from './format';
import { formatDate } from './format';

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

describe('formatDate', () => {
  it('preserva datas no formato YYYY-MM-DD sem deslocar pelo timezone', () => {
    expect(formatDate('2026-03-15')).toBe('15/03/2026');
  });
});

describe('buildValidationUrl', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it('inclui token publico assinado quando informado', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/base';

    expect(
      buildValidationUrl('DDS-2026-DDS1', 'token-123', {
        module: 'dds',
        mode: 'code',
      }),
    ).toBe(
      'http://localhost/validar/DDS-2026-DDS1?token=token-123&module=dds&mode=code',
    );
  });
});

describe('sanitize', () => {
  it('normaliza caracteres problemáticos para o PDF', () => {
    expect(sanitize('Garantir extintores de CO₂ — “próximos”\x00')).toBe(
      'Garantir extintores de CO2 - "próximos"',
    );
  });

  it('remove controles invisíveis sem destruir quebras de linha', () => {
    expect(sanitize('Linha 1\x13\nLinha 2')).toBe('Linha 1\nLinha 2');
  });

  it('insere quebra suave em tokens longos para evitar estouro no layout do PDF', () => {
    const longToken =
      'SEMESPACO1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZTOKENFINAL';
    const sanitized = sanitize(longToken);

    expect(sanitized).toContain(' ');
  });
});
