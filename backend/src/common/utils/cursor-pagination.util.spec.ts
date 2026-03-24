import {
  decodeCursorToken,
  encodeCursorToken,
  toCursorPaginatedResponse,
} from './cursor-pagination.util';

describe('cursor-pagination.util', () => {
  it('codifica e decodifica token de cursor', () => {
    const payload = {
      id: 'row-1',
      created_at: '2026-03-24T12:00:00.000Z',
    };

    const token = encodeCursorToken(payload);
    const decoded = decodeCursorToken(token);

    expect(decoded).toEqual(payload);
  });

  it('gera cursor e hasMore corretamente com limite', () => {
    const response = toCursorPaginatedResponse({
      rows: [
        { id: '1', created_at: '2026-03-24T10:00:00.000Z' },
        { id: '2', created_at: '2026-03-24T09:00:00.000Z' },
        { id: '3', created_at: '2026-03-24T08:00:00.000Z' },
      ],
      limit: 2,
      getCreatedAt: (row) => row.created_at,
    });

    expect(response.hasMore).toBe(true);
    expect(response.data).toHaveLength(2);
    expect(response.cursor).toBeTruthy();

    const decoded = decodeCursorToken(response.cursor);
    expect(decoded).toEqual({
      id: '2',
      created_at: '2026-03-24T09:00:00.000Z',
    });
  });
});
