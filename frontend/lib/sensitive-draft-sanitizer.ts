const SENSITIVE_DRAFT_KEY_PATTERN =
  /(cpf|documento|assinatura|signature|evidence|evidencia|photo|foto|image|imagem|attachment|anexo|arquivo|file|base64|dataurl|data_url|saude|medical|exame|token|password|senha|pdf|url|private|presigned)/i;

export function sanitizeSensitiveDraftValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitiveDraftValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, item]) => {
        if (SENSITIVE_DRAFT_KEY_PATTERN.test(key)) {
          return acc;
        }
        acc[key] = sanitizeSensitiveDraftValue(item);
        return acc;
      },
      {},
    );
  }

  if (typeof value === 'string' && value.startsWith('data:')) {
    return '';
  }

  return value;
}
