import { BadRequestException } from '@nestjs/common';
import {
  buildCursorPage,
  clampCursorLimit,
  decodeCursor,
  encodeCursor,
  applyCursorWhere,
} from './cursor-pagination.util';

describe('cursor-pagination.util', () => {
  describe('encode/decode round-trip', () => {
    it('encodes and decodes a Date created_at preserving precision', () => {
      const date = new Date('2026-04-26T12:34:56.789Z');
      const encoded = encodeCursor({ created_at: date, id: 'abc-123' });
      const decoded = decodeCursor(encoded);
      expect(decoded).not.toBeNull();
      expect((decoded!.created_at as Date).toISOString()).toBe(
        date.toISOString(),
      );
      expect(decoded!.id).toBe('abc-123');
    });

    it('accepts string created_at', () => {
      const iso = '2026-04-26T00:00:00.000Z';
      const encoded = encodeCursor({ created_at: iso, id: 'x' });
      const decoded = decodeCursor(encoded);
      expect((decoded!.created_at as Date).toISOString()).toBe(iso);
    });

    it('returns null when cursor is empty/missing', () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });
  });

  describe('decode error handling', () => {
    it('throws BadRequestException for non-string input', () => {
      expect(() => decodeCursor(123)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for malformed base64', () => {
      expect(() => decodeCursor('!!!not-base64!!!')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for wrong version', () => {
      const stale = Buffer.from(
        JSON.stringify({ v: 'v0', c: '2026-01-01', i: 'x' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(stale)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for missing fields', () => {
      const broken = Buffer.from(
        JSON.stringify({ v: 'v1', c: '2026-01-01' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(broken)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid timestamp', () => {
      const broken = Buffer.from(
        JSON.stringify({ v: 'v1', c: 'not-a-date', i: 'x' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(broken)).toThrow(BadRequestException);
    });
  });

  describe('buildCursorPage', () => {
    type Row = { id: string; created_at: Date };
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: `id-${i}`,
      created_at: new Date(2026, 0, i + 1),
    }));

    it('returns hasMore=true and trims to limit when limit+1 rows present', () => {
      const page = buildCursorPage(rows, 5, (r) => ({
        created_at: r.created_at,
        id: r.id,
      }));
      expect(page.data).toHaveLength(5);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });

    it('returns hasMore=false and nextCursor=null when fewer than limit+1', () => {
      const page = buildCursorPage(rows.slice(0, 3), 5, (r) => ({
        created_at: r.created_at,
        id: r.id,
      }));
      expect(page.data).toHaveLength(3);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('handles empty array', () => {
      const page = buildCursorPage([], 10, (r: Row) => ({
        created_at: r.created_at,
        id: r.id,
      }));
      expect(page.data).toEqual([]);
      expect(page.nextCursor).toBeNull();
      expect(page.hasMore).toBe(false);
    });

    it('handles limit=0 by returning empty page', () => {
      const page = buildCursorPage(rows, 0, (r) => ({
        created_at: r.created_at,
        id: r.id,
      }));
      expect(page.data).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('clampCursorLimit', () => {
    it('returns default when undefined or invalid', () => {
      expect(clampCursorLimit(undefined)).toBe(20);
      expect(clampCursorLimit(NaN)).toBe(20);
      expect(clampCursorLimit(0)).toBe(20);
      expect(clampCursorLimit(-5)).toBe(20);
    });

    it('clamps to max', () => {
      expect(clampCursorLimit(500)).toBe(100);
      expect(clampCursorLimit(150, 20, 100)).toBe(100);
    });

    it('returns valid limits unchanged', () => {
      expect(clampCursorLimit(50)).toBe(50);
    });

    it('truncates fractional values', () => {
      expect(clampCursorLimit(7.9)).toBe(7);
    });
  });

  describe('applyCursorWhere', () => {
    it('does nothing when cursor is null', () => {
      const qb = {
        andWhere: jest.fn(),
      };
      applyCursorWhere(qb as never, null, { alias: 'r' });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('appends WHERE row-value comparison with DESC default operator', () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
      };
      const date = new Date('2026-04-26T00:00:00.000Z');
      applyCursorWhere(
        qb as never,
        { created_at: date, id: 'x-1' },
        { alias: 'apr' },
      );
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      const [sql, params] = qb.andWhere.mock.calls[0];
      expect(sql).toContain('"apr"."created_at"');
      expect(sql).toContain('"apr"."id"');
      expect(sql).toContain(' < ');
      expect(params).toEqual({
        __cursorCreatedAt: date.toISOString(),
        __cursorId: 'x-1',
      });
    });

    it('uses ascending operator when desc=false', () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
      };
      applyCursorWhere(
        qb as never,
        { created_at: new Date(), id: 'x' },
        { alias: 'r', desc: false },
      );
      const [sql] = qb.andWhere.mock.calls[0];
      expect(sql).toContain(' > ');
    });

    it('respects custom field overrides', () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
      };
      applyCursorWhere(
        qb as never,
        { created_at: new Date(), id: 'x' },
        {
          alias: 'r',
          fields: { createdAt: 'occurred_at', id: 'event_id' },
        },
      );
      const [sql] = qb.andWhere.mock.calls[0];
      expect(sql).toContain('"r"."occurred_at"');
      expect(sql).toContain('"r"."event_id"');
    });
  });
});
