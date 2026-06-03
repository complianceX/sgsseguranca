import {
  buildTenantStorageKey,
  extractTenantPrefix,
  isTenantScopedKey,
} from './storage-key-builder';

describe('storage-key-builder', () => {
  const companyId = 'a1b2c3d4-e5f6-4789-8abc-def012345678';

  describe('buildTenantStorageKey', () => {
    it('builds the expected path layout with deterministic inputs', () => {
      const key = buildTenantStorageKey({
        companyId,
        kind: 'documents',
        extension: 'pdf',
        date: new Date(Date.UTC(2026, 3, 26, 12, 0, 0)),
        fileId: '00000000-0000-4000-8000-000000000001',
      });
      expect(key).toBe(
        'a1b2c3d4-e5f6-4789-8abc-def012345678/documents/2026/04/00000000-0000-4000-8000-000000000001.pdf',
      );
    });

    it('zero-pads single-digit months', () => {
      const key = buildTenantStorageKey({
        companyId,
        kind: 'reports',
        date: new Date(Date.UTC(2026, 0, 5)),
        fileId: '00000000-0000-4000-8000-000000000002',
      });
      expect(key).toContain('/2026/01/');
    });

    it('omits extension when not provided', () => {
      const key = buildTenantStorageKey({
        companyId,
        kind: 'evidences',
        date: new Date(Date.UTC(2026, 3, 26)),
        fileId: '00000000-0000-4000-8000-000000000003',
      });
      expect(key).toBe(
        'a1b2c3d4-e5f6-4789-8abc-def012345678/evidences/2026/04/00000000-0000-4000-8000-000000000003',
      );
    });

    it('strips leading dot from extension and lowercases', () => {
      const key = buildTenantStorageKey({
        companyId,
        kind: 'documents',
        extension: '.PDF',
        date: new Date(Date.UTC(2026, 3, 26)),
        fileId: '00000000-0000-4000-8000-000000000004',
      });
      expect(key.endsWith('.pdf')).toBe(true);
    });

    it('uses UTC, not local time, for year/month', () => {
      // 2026-01-01T00:00:00Z is 2025-12-31 in some local TZs; key must be 2026/01.
      const key = buildTenantStorageKey({
        companyId,
        kind: 'documents',
        date: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
        fileId: '00000000-0000-4000-8000-000000000005',
      });
      expect(key).toContain('/2026/01/');
    });

    it('throws on missing companyId', () => {
      expect(() =>
        buildTenantStorageKey({
          companyId: '',
          kind: 'documents',
        }),
      ).toThrow(/companyId obrigatório/);
    });

    it('throws on non-UUID companyId (anti-spoofing)', () => {
      expect(() =>
        buildTenantStorageKey({
          companyId: '../../etc/passwd',
          kind: 'documents',
        }),
      ).toThrow(/UUID/);
    });

    it('rejects extensions with path separators or special chars', () => {
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: 'documents',
          extension: 'pdf/../etc',
        }),
      ).toThrow(/extensão inválida/);
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: 'documents',
          extension: 'p df',
        }),
      ).toThrow(/extensão inválida/);
    });

    it('rejects extensions longer than 8 chars', () => {
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: 'documents',
          extension: 'abcdefghi',
        }),
      ).toThrow(/extensão inválida/);
    });

    it('rejects kinds with uppercase or special chars', () => {
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: 'Reports',
        }),
      ).not.toThrow(); // lowercased to 'reports'
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: 'rep orts',
        }),
      ).toThrow(/kind inválido/);
      expect(() =>
        buildTenantStorageKey({
          companyId,
          kind: '../etc',
        }),
      ).toThrow(/kind inválido/);
    });

    it('generates fresh UUIDs when fileId not provided', () => {
      const a = buildTenantStorageKey({
        companyId,
        kind: 'documents',
      });
      const b = buildTenantStorageKey({
        companyId,
        kind: 'documents',
      });
      expect(a).not.toBe(b);
    });
  });

  describe('isTenantScopedKey', () => {
    it('returns true for keys starting with a UUID', () => {
      expect(
        isTenantScopedKey(
          'a1b2c3d4-e5f6-4789-8abc-def012345678/documents/2026/04/x.pdf',
        ),
      ).toBe(true);
    });

    it('returns false for legacy keys', () => {
      expect(isTenantScopedKey('reports/some-user/123.pdf')).toBe(false);
      expect(isTenantScopedKey('documents/foo.pdf')).toBe(false);
      expect(isTenantScopedKey('')).toBe(false);
    });
  });

  describe('extractTenantPrefix', () => {
    it('returns the companyId for tenant-scoped keys', () => {
      expect(
        extractTenantPrefix(
          'a1b2c3d4-e5f6-4789-8abc-def012345678/reports/2026/04/x.pdf',
        ),
      ).toBe('a1b2c3d4-e5f6-4789-8abc-def012345678');
    });

    it('returns null for legacy keys', () => {
      expect(extractTenantPrefix('reports/legacy/x.pdf')).toBeNull();
    });
  });
});
