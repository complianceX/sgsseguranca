import type { TransformFnParams } from 'class-transformer';

const HTML_ENTITY_BY_CHAR: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function sanitizePlainText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = '';
  for (const char of value.normalize('NFC')) {
    sanitized += HTML_ENTITY_BY_CHAR[char] ?? char;
  }

  return sanitized.replaceAll('\u0000', '');
}

export function sanitizePlainTextTransform({
  value,
}: TransformFnParams): unknown {
  return sanitizePlainText(value);
}
