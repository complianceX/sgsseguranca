const SENSITIVE_DRAFT_KEY_PATTERN =
  /(authorization|headers|cookie|csrf|cpf|rg|email|telefone|phone|documento|document|assinatura|signature|evidence|evidencia|photo|foto|image|imagem|attachment|anexo|arquivo|file|filekey|file_key|base64|dataurl|data_url|saude|medical|exame|aso|token|password|senha|pdf|url|private|presigned)/i;

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const DATA_URL_PATTERN = /^data:/i;
const SIGNED_OR_PRIVATE_URL_PATTERN =
  /(X-Amz-Signature|X-Amz-Credential|Signature=|Expires=|r2\.cloudflarestorage\.com|storage\.local|\/storage\/download\/)/i;

export const SENSITIVE_LOCAL_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

function toTimestamp(value?: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function getSensitiveDraftExpiresAt(savedAt?: number | string | null) {
  return (toTimestamp(savedAt) ?? Date.now()) + SENSITIVE_LOCAL_DRAFT_TTL_MS;
}

export function isSensitiveDraftExpired(params: {
  savedAt?: number | string | null;
  expiresAt?: number | string | null;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const expiresAt = toTimestamp(params.expiresAt);
  if (expiresAt !== null) {
    return expiresAt <= now;
  }

  const savedAt = toTimestamp(params.savedAt);
  return savedAt !== null && now - savedAt > SENSITIVE_LOCAL_DRAFT_TTL_MS;
}

export function sanitizeSensitiveDraftValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitiveDraftValue(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [key, item]) => {
      if (SENSITIVE_DRAFT_KEY_PATTERN.test(key)) {
        return acc;
      }
      acc[key] = sanitizeSensitiveDraftValue(item);
      return acc;
    }, {});
  }

  if (
    typeof value === "string" &&
    (DATA_URL_PATTERN.test(value) ||
      CPF_PATTERN.test(value) ||
      SIGNED_OR_PRIVATE_URL_PATTERN.test(value))
  ) {
    return "";
  }

  return value;
}
