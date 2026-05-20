import { BadRequestException } from '@nestjs/common';
import {
  applyCursorKeyset,
  decodeCursorToken,
  encodeCursorToken,
} from './cursor-pagination.util';

describe('cursor-pagination.util', () => {
  function createQueryBuilderMock() {
    const mocks = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
    };

    return {
      qb: mocks as unknown as Parameters<typeof applyCursorKeyset>[0],
      mocks,
    };
  }

  it('aplica keyset com colunas válidas e alias esperado', () => {
    const { qb, mocks } = createQueryBuilderMock();

    applyCursorKeyset(qb, 'report', {
      limit: 10,
      createdAtColumn: 'created_at',
      idColumn: 'id',
    });

    expect(mocks.orderBy).toHaveBeenCalledWith('report.created_at', 'DESC');
    expect(mocks.addOrderBy).toHaveBeenCalledWith('report.id', 'DESC');
    expect(mocks.take).toHaveBeenCalledWith(11);
  });

  it('rejeita coluna fora da allowlist padrão', () => {
    const { qb } = createQueryBuilderMock();

    expect(() =>
      applyCursorKeyset(qb, 'report', {
        limit: 10,
        createdAtColumn: 'updated_at',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejeita payload malicioso antes de montar SQL', () => {
    const { qb, mocks } = createQueryBuilderMock();

    expect(() =>
      applyCursorKeyset(qb, 'report', {
        limit: 10,
        createdAtColumn: 'created_at; DROP TABLE users; --',
      }),
    ).toThrow(/Unsafe SQL identifier/);

    expect(mocks.andWhere).not.toHaveBeenCalled();
    expect(mocks.orderBy).not.toHaveBeenCalled();
  });

  it('suporta ASC e DESC', () => {
    const { qb: qbAsc, mocks: ascMocks } = createQueryBuilderMock();
    const { qb: qbDesc, mocks: descMocks } = createQueryBuilderMock();

    applyCursorKeyset(qbAsc, 'report', {
      limit: 5,
      direction: 'asc',
    });
    applyCursorKeyset(qbDesc, 'report', {
      limit: 5,
      direction: 'desc',
    });

    expect(ascMocks.orderBy).toHaveBeenCalledWith('report.created_at', 'ASC');
    expect(ascMocks.addOrderBy).toHaveBeenCalledWith('report.id', 'ASC');
    expect(descMocks.orderBy).toHaveBeenCalledWith('report.created_at', 'DESC');
    expect(descMocks.addOrderBy).toHaveBeenCalledWith('report.id', 'DESC');
  });

  it('aplica filtro de cursor quando token válido é informado', () => {
    const { qb, mocks } = createQueryBuilderMock();
    const cursor = encodeCursorToken({
      created_at: '2026-05-19T12:00:00.000Z',
      id: 'row-123',
    });

    applyCursorKeyset(qb, 'report', {
      cursor,
      limit: 10,
    });

    expect(decodeCursorToken(cursor)).toEqual({
      created_at: '2026-05-19T12:00:00.000Z',
      id: 'row-123',
    });
    expect(mocks.andWhere).toHaveBeenCalledWith(
      '(report.created_at, report.id) < (:__cursorCreatedAt, :__cursorId)',
      {
        __cursorCreatedAt: '2026-05-19T12:00:00.000Z',
        __cursorId: 'row-123',
      },
    );
  });

  it('mantém compatibilidade com aliases simples e colunas explicitamente aprovadas', () => {
    const { qb, mocks } = createQueryBuilderMock();

    applyCursorKeyset(qb, 'expense_report', {
      limit: 10,
      createdAtColumn: 'issued_at',
      idColumn: 'report_id',
      allowedColumns: ['issued_at', 'report_id'],
    });

    expect(mocks.orderBy).toHaveBeenCalledWith(
      'expense_report.issued_at',
      'DESC',
    );
    expect(mocks.addOrderBy).toHaveBeenCalledWith(
      'expense_report.report_id',
      'DESC',
    );
  });
});
