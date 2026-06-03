import {
  sanitizePlainText,
  sanitizePlainTextTransform,
} from './plain-text-sanitizer.util';
import type { TransformFnParams } from 'class-transformer';

describe('plain-text-sanitizer.util', () => {
  it('encodes HTML control characters instead of trying to strip partial tags', () => {
    expect(
      sanitizePlainText('<script>alert("x")</script><img src=x onerror=1>'),
    ).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=1&gt;',
    );
  });

  it('removes null bytes and keeps non-string values unchanged', () => {
    expect(sanitizePlainText('abc\u0000def')).toBe('abcdef');
    expect(sanitizePlainText(123)).toBe(123);
    expect(sanitizePlainText(null)).toBeNull();
  });

  it('can be used directly as a class-transformer transform', () => {
    const params = { value: '<b>ok</b>' } as TransformFnParams;
    expect(sanitizePlainTextTransform(params)).toBe('&lt;b&gt;ok&lt;/b&gt;');
  });
});
