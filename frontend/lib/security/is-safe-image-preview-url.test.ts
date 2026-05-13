import { isSafeImagePreviewUrl } from './is-safe-image-preview-url';

describe('isSafeImagePreviewUrl', () => {
  it('permite previews locais, data image, blob e hosts conhecidos', () => {
    expect(isSafeImagePreviewUrl('/uploads/evidencia.png')).toBe(true);
    expect(isSafeImagePreviewUrl('data:image/png;base64,AAA')).toBe(true);
    expect(isSafeImagePreviewUrl('blob:https://app.sgsseguranca.com.br/123')).toBe(
      true,
    );
    expect(
      isSafeImagePreviewUrl('https://bucket.r2.cloudflarestorage.com/foto.jpg'),
    ).toBe(true);
  });

  it('bloqueia protocolo relativo, host externo e caracteres perigosos', () => {
    expect(isSafeImagePreviewUrl('//evil.example/foto.jpg')).toBe(false);
    expect(isSafeImagePreviewUrl('https://evil.example/foto.jpg')).toBe(false);
    expect(isSafeImagePreviewUrl('/uploads/%5c%5c/foto.jpg')).toBe(false);
    expect(isSafeImagePreviewUrl('javascript:alert(1)')).toBe(false);
  });
});
