import { randomUUID } from 'node:crypto';

/**
 * Builders for tenant-aware, sortable S3 keys.
 *
 * Path layout: `{companyId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}`
 *
 * Why this shape:
 *   - companyId prefix: enables S3 lifecycle rules per tenant, billing
 *     allocation per tenant, and bulk migration when offboarding a tenant
 *     (single prefix delete vs. scanning the whole bucket).
 *   - kind segment: separates documents/evidences/reports/avatars so
 *     lifecycle rules can apply different retention by category.
 *   - year/month: groups files temporally — INTELLIGENT_TIERING and
 *     archival policies operate on prefix age efficiently.
 *   - uuid filename: avoids collisions and prevents enumeration attacks
 *     based on filename guessing.
 *
 * Existing legacy keys (e.g. `reports/{userId}/{timestamp}.pdf`) keep
 * working — this helper is opt-in for new code and future migrations.
 */

export type StorageKind =
  | 'documents'
  | 'reports'
  | 'evidences'
  | 'signatures'
  | 'avatars'
  | 'imports'
  | 'exports';

const COMPANY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAFE_EXT_PATTERN = /^[a-z0-9]{1,8}$/;

const SAFE_KIND_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;

export interface StorageKeyInput {
  companyId: string;
  kind: string;
  /**
   * Optional file extension (without leading dot). Lowercased and validated:
   * only [a-z0-9] up to 8 chars are accepted to prevent path-traversal or
   * Unicode tricks. Falsy values omit the extension.
   */
  extension?: string;
  /**
   * Optional date used for the year/month segments. Defaults to the current
   * UTC date. Pass an explicit date for backfills or when keys must
   * correspond to a record timestamp.
   */
  date?: Date;
  /**
   * Optional UUID for the filename. Defaults to a fresh randomUUID(). Pass
   * an explicit UUID when the file maps 1:1 to a domain entity (e.g. APR id).
   */
  fileId?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function sanitizeExtension(ext?: string): string {
  if (!ext) return '';
  const cleaned = ext.replace(/^\./, '').toLowerCase().trim();
  if (!cleaned) return '';
  if (!SAFE_EXT_PATTERN.test(cleaned)) {
    throw new Error(
      `Storage key: extensão inválida "${ext}". Esperado [a-z0-9]{1,8}.`,
    );
  }
  return `.${cleaned}`;
}

function sanitizeKind(kind: string): string {
  const cleaned = String(kind || '')
    .toLowerCase()
    .trim();
  if (!SAFE_KIND_PATTERN.test(cleaned)) {
    throw new Error(
      `Storage key: kind inválido "${kind}". Esperado [a-z][a-z0-9-]{0,30}.`,
    );
  }
  return cleaned;
}

function sanitizeCompanyId(companyId: string): string {
  if (!companyId || typeof companyId !== 'string') {
    throw new Error('Storage key: companyId obrigatório.');
  }
  const cleaned = companyId.trim().toLowerCase();
  if (!COMPANY_ID_PATTERN.test(cleaned)) {
    throw new Error(
      'Storage key: companyId deve ser UUID v1-5 válido (anti-spoofing de path).',
    );
  }
  return cleaned;
}

/**
 * Builds a fresh tenant-scoped storage key. Pure function — no side effects,
 * deterministic when fileId/date are provided.
 */
export function buildTenantStorageKey(input: StorageKeyInput): string {
  const companyId = sanitizeCompanyId(input.companyId);
  const kind = sanitizeKind(input.kind);
  const date = input.date ?? new Date();
  const year = String(date.getUTCFullYear());
  const month = pad2(date.getUTCMonth() + 1);
  const fileId = input.fileId ?? randomUUID();
  const ext = sanitizeExtension(input.extension);

  return `${companyId}/${kind}/${year}/${month}/${fileId}${ext}`;
}

/**
 * Cheap structural check used by the storage service to decide whether a
 * key should be treated as tenant-scoped (new layout) or legacy. Does not
 * validate the UUID strictly — only that the first segment looks like one.
 */
export function isTenantScopedKey(key: string): boolean {
  if (!key) return false;
  const firstSegment = key.split('/', 1)[0];
  return COMPANY_ID_PATTERN.test(firstSegment);
}

/**
 * Extracts the tenant prefix from a tenant-scoped key. Returns null for
 * legacy/non-tenant keys so callers can route accordingly.
 */
export function extractTenantPrefix(key: string): string | null {
  if (!isTenantScopedKey(key)) return null;
  return key.split('/', 1)[0];
}
