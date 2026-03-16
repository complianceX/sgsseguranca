import { resolveSafeBrowserUrl } from './print-utils';

describe('resolveSafeBrowserUrl', () => {
  it('aceita URLs https e blob para documentos', () => {
    expect(
      resolveSafeBrowserUrl('https://storage.example.com/document.pdf'),
    ).toBe('https://storage.example.com/document.pdf');
    expect(resolveSafeBrowserUrl('blob:https://app.local/123')).toBe(
      'blob:https://app.local/123',
    );
  });

  it('rejeita protocolos inseguros para abertura de documentos', () => {
    expect(() => resolveSafeBrowserUrl('javascript:alert(1)')).toThrow(
      /Protocolo de URL não permitido/i,
    );
    expect(() => resolveSafeBrowserUrl('data:text/html,evil')).toThrow(
      /Protocolo de URL não permitido/i,
    );
  });
});
