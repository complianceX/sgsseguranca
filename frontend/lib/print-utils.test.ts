import { openPdfForPrint, resolveSafeBrowserUrl } from './print-utils';

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

describe('openPdfForPrint', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('não substitui a tela atual quando o pop-up é bloqueado', () => {
    const onPopupBlocked = jest.fn();
    jest.spyOn(window, 'open').mockReturnValue(null);

    expect(
      openPdfForPrint(
        'https://storage.example.com/document.pdf',
        onPopupBlocked,
      ),
    ).toBe(false);
    expect(onPopupBlocked).toHaveBeenCalledTimes(1);
  });

  it('navega uma janela preparada sem depender de novo pop-up após chamada assíncrona', () => {
    const openSpy = jest.spyOn(window, 'open');
    const fakeWindow = {
      opener: {},
      location: { href: '' },
      focus: jest.fn(),
      print: jest.fn(),
      addEventListener: jest.fn(),
    } as unknown as Window & { location: { href: string } };

    expect(
      openPdfForPrint(
        'https://storage.example.com/document.pdf',
        undefined,
        fakeWindow,
      ),
    ).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(fakeWindow.location.href).toBe(
      'https://storage.example.com/document.pdf',
    );
  });
});
