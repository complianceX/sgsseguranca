/**
 * Utilitários de validação de chaves S3 / Cloudflare R2.
 *
 * Por que é necessário:
 *   - S3 trata a chave como string opaca — NÃO normaliza `../`. Porém, se o
 *     fileKey recebido do cliente passar por qualquer decodificação URL ou
 *     manipulação de path antes de chegar ao S3, `..` poderia resolver para
 *     um bucket prefix diferente.
 *   - Null bytes em chaves S3 causam comportamento indefinido em algumas SDKs.
 *   - Caracteres de controle podem ser usados para log injection.
 *   - Validação estrita elimina toda a superfície de ataque de path traversal.
 */

/** Regex para UUID v4 sem hífens (para validar a parte UUID da chave). */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Comprimento máximo de uma chave S3 (limite real do S3: 1024 bytes). */
const MAX_KEY_LENGTH = 512;

/** Segmentos proibidos em qualquer chave S3 recebida de cliente. */
const TRAVERSAL_SEGMENTS = ['..', '.'];

/**
 * Valida e normaliza uma chave S3 recebida do cliente.
 *
 * Retorna `null` se a chave for inválida — o chamador deve lançar
 * BadRequestException/ForbiddenException.
 */
export function sanitizeS3Key(key: string): string | null {
  if (typeof key !== 'string' || !key.trim()) return null;

  // Comprimento máximo
  if (key.length > MAX_KEY_LENGTH) return null;

  // Null bytes e caracteres de controle
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) return null;

  // Normalizar separadores (Windows-style backslash → forward slash)
  const normalized = key.replace(/\\/g, '/');

  // Segmentos de traversal após split por '/'
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (TRAVERSAL_SEGMENTS.includes(segment)) return null;
  }

  // Duplas barras consecutivas
  if (normalized.includes('//')) return null;

  // Barra no início ou fim (chaves S3 não devem começar com /)
  if (normalized.startsWith('/') || normalized.endsWith('/')) return null;

  return normalized;
}

/**
 * Valida que uma chave S3 segue o padrão de quarentena governado:
 *   `quarantine/{tenantId}/{uuid}.pdf`
 *
 * Esta validação é mais estrita que `startsWith` pois verifica:
 * - Prefixo correto para o tenant
 * - Segmento de filename é um UUID v4 com extensão .pdf
 * - Sem segmentos extras (sem path traversal possível)
 */
export function assertQuarantineKey(
  key: string,
  tenantId: string,
): asserts key is string {
  const clean = sanitizeS3Key(key);
  if (!clean) {
    throw new Error('S3 key inválida (caracteres não permitidos).');
  }

  const expectedPrefix = `quarantine/${tenantId}/`;
  if (!clean.startsWith(expectedPrefix)) {
    throw new Error('S3 key não pertence à quarentena desta empresa.');
  }

  // Parte após o prefix deve ser exatamente `{uuid}.pdf`
  const filename = clean.slice(expectedPrefix.length);
  if (!filename.endsWith('.pdf')) {
    throw new Error('S3 key não tem extensão .pdf.');
  }

  const uuidPart = filename.slice(0, -4); // remove `.pdf`
  if (!UUID_V4_RE.test(uuidPart)) {
    throw new Error('S3 key não contém UUID v4 válido.');
  }

  // Garantir que não há slashes adicionais após o prefix (sem subpastas)
  if (filename.includes('/')) {
    throw new Error('S3 key contém segmentos inesperados.');
  }
}
