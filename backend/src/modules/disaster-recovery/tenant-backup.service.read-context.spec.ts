import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PrivilegedDbService } from '../../shared/database/privileged-db.service';
import { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import { TenantBackupService } from './tenant-backup.service';

type BackupReadQuery = <Row extends Record<string, unknown>>(
  sql: string,
  parameters?: unknown[],
) => Promise<Row[]>;

type TenantBackupServiceReadContext = {
  withTenantExportReadContext<T>(
    operation: (query: BackupReadQuery) => Promise<T>,
  ): Promise<T>;
};

type RelatedRowsPayload = {
  primaryKeyColumns: string[];
  rowCount: number;
  rows: Array<Record<string, unknown>>;
};

type TenantBackupServiceRelations = {
  expandRelatedRowsByForeignKeys(input: {
    tables: Map<string, RelatedRowsPayload>;
    schema: {
      companyScopedTables: string[];
      primaryKeysByTable: Map<string, string[]>;
      foreignKeys: Array<{
        table: string;
        column: string;
        referencedTable: string;
        referencedColumn: string;
      }>;
      columnsByTable: Map<string, Set<string>>;
      jsonColumnsByTable: Map<string, Set<string>>;
    };
    query: BackupReadQuery;
  }): Promise<void>;
  pseudonymizeExternalUserReferences(input: {
    tables: Map<string, RelatedRowsPayload>;
    schema: {
      companyScopedTables: string[];
      primaryKeysByTable: Map<string, string[]>;
      foreignKeys: Array<{
        table: string;
        column: string;
        referencedTable: string;
        referencedColumn: string;
      }>;
      columnsByTable: Map<string, Set<string>>;
      jsonColumnsByTable: Map<string, Set<string>>;
    };
    companyId: string;
    exportedAt: string;
  }): number;
};

function invokeReadContext<T>(
  service: TenantBackupService,
  operation: (query: BackupReadQuery) => Promise<T>,
): Promise<T> {
  return (
    service as unknown as TenantBackupServiceReadContext
  ).withTenantExportReadContext(operation);
}

function makeService(input: {
  dataSource: Partial<DataSource>;
  privilegedDb: unknown;
}): TenantBackupService {
  return new TenantBackupService(
    input.dataSource as DataSource,
    {} as ConfigService,
    {} as DisasterRecoveryExecutionService,
    input.privilegedDb as PrivilegedDbService,
  );
}

describe('TenantBackupService — contexto de leitura da exportação', () => {
  it('mantém o mesmo client sgs_admin durante todas as leituras do payload', async () => {
    const client = {
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.startsWith('SELECT')
            ? { rows: [{ source: 'sgs_admin' }] }
            : { rows: [] },
        ),
      ),
    };
    const privilegedDb = {
      isEnabled: jest.fn().mockReturnValue(true),
      withPrivilegedClient: jest.fn(
        async (
          operation: (value: typeof client) => Promise<unknown>,
        ): Promise<unknown> => operation(client),
      ),
    };
    const dataSourceQuery = jest.fn();
    const service = makeService({
      dataSource: { query: dataSourceQuery },
      privilegedDb,
    });

    const result = await invokeReadContext(service, async (query) => {
      const companyRows = await query<{ source: string }>(
        'SELECT * FROM companies',
      );
      const workerRows = await query<{ source: string }>('SELECT * FROM users');
      return [...companyRows, ...workerRows];
    });

    expect(result).toEqual([{ source: 'sgs_admin' }, { source: 'sgs_admin' }]);
    expect(dataSourceQuery).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      "SET LOCAL app.is_super_admin = 'true'",
      'SELECT * FROM companies',
      'SELECT * FROM users',
      'COMMIT',
    ]);
  });

  it('libera o QueryRunner quando connect falha', async () => {
    const connectError = new Error('connect failed');
    const queryRunner = {
      isTransactionActive: false,
      connect: jest.fn().mockRejectedValue(connectError),
      startTransaction: jest.fn(),
      query: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService({
      dataSource: {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      },
      privilegedDb: {
        isEnabled: jest.fn().mockReturnValue(false),
      },
    });

    await expect(
      invokeReadContext(service, () => Promise.resolve('unused')),
    ).rejects.toBe(connectError);

    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('libera o QueryRunner quando startTransaction falha', async () => {
    const transactionError = new Error('transaction failed');
    const queryRunner = {
      isTransactionActive: true,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockRejectedValue(transactionError),
      query: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService({
      dataSource: {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      },
      privilegedDb: {
        isEnabled: jest.fn().mockReturnValue(false),
      },
    });

    await expect(
      invokeReadContext(service, () => Promise.resolve('unused')),
    ).rejects.toBe(transactionError);

    expect(queryRunner.query).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('inclui pais globais referenciados para permitir restore em banco limpo', async () => {
    const service = makeService({
      dataSource: {},
      privilegedDb: { isEnabled: jest.fn().mockReturnValue(false) },
    });
    const tables = new Map<string, RelatedRowsPayload>([
      [
        'users',
        {
          primaryKeyColumns: ['id'],
          rowCount: 1,
          rows: [{ id: 'user-1', profile_id: 'profile-1' }],
        },
      ],
    ]);
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM "profiles"')
          ? [{ id: 'profile-1', name: 'ADMIN_EMPRESA' }]
          : [],
      ),
    ) as BackupReadQuery & jest.Mock;

    await (
      service as unknown as TenantBackupServiceRelations
    ).expandRelatedRowsByForeignKeys({
      tables,
      schema: {
        companyScopedTables: ['users'],
        primaryKeysByTable: new Map([
          ['users', ['id']],
          ['profiles', ['id']],
        ]),
        foreignKeys: [
          {
            table: 'users',
            column: 'profile_id',
            referencedTable: 'profiles',
            referencedColumn: 'id',
          },
        ],
        columnsByTable: new Map([
          ['users', new Set(['id', 'profile_id'])],
          ['profiles', new Set(['id', 'name'])],
        ]),
        jsonColumnsByTable: new Map(),
      },
      query,
    });

    expect(tables.get('profiles')?.rows).toEqual([
      { id: 'profile-1', name: 'ADMIN_EMPRESA' },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "profiles"'),
      [['profile-1']],
    );
  });

  it('reprocessa relações quando o grafo ganha linhas por outro caminho', async () => {
    const service = makeService({
      dataSource: {},
      privilegedDb: { isEnabled: jest.fn().mockReturnValue(false) },
    });
    const tables = new Map<string, RelatedRowsPayload>([
      [
        'users',
        {
          primaryKeyColumns: ['id'],
          rowCount: 1,
          rows: [{ id: 'user-1' }],
        },
      ],
    ]);
    const query = jest.fn((sql: string, parameters?: unknown[]) => {
      const values = (parameters?.[0] ?? []) as string[];
      if (sql.includes('FROM "user_roles"')) {
        return Promise.resolve([{ user_id: 'user-1', role_id: 'role-a' }]);
      }
      if (sql.includes('FROM "roles"')) {
        return Promise.resolve(
          values.map((id) => ({ id, name: id.toUpperCase() })),
        );
      }
      if (
        sql.includes('FROM "role_permissions"') &&
        sql.includes('"role_id"')
      ) {
        return Promise.resolve(
          values.includes('role-a')
            ? [{ role_id: 'role-a', permission_id: 'permission-x' }]
            : [{ role_id: 'role-b', permission_id: 'permission-x' }],
        );
      }
      if (
        sql.includes('FROM "role_permissions"') &&
        sql.includes('"permission_id"')
      ) {
        return Promise.resolve([
          { role_id: 'role-a', permission_id: 'permission-x' },
          { role_id: 'role-b', permission_id: 'permission-x' },
        ]);
      }
      if (sql.includes('FROM "permissions"')) {
        return Promise.resolve([{ id: 'permission-x', name: 'document.read' }]);
      }
      return Promise.resolve([]);
    }) as BackupReadQuery & jest.Mock;

    await (
      service as unknown as TenantBackupServiceRelations
    ).expandRelatedRowsByForeignKeys({
      tables,
      schema: {
        companyScopedTables: ['users'],
        primaryKeysByTable: new Map([
          ['users', ['id']],
          ['user_roles', ['user_id', 'role_id']],
          ['roles', ['id']],
          ['role_permissions', ['role_id', 'permission_id']],
          ['permissions', ['id']],
        ]),
        foreignKeys: [
          {
            table: 'user_roles',
            column: 'user_id',
            referencedTable: 'users',
            referencedColumn: 'id',
          },
          {
            table: 'user_roles',
            column: 'role_id',
            referencedTable: 'roles',
            referencedColumn: 'id',
          },
          {
            table: 'role_permissions',
            column: 'role_id',
            referencedTable: 'roles',
            referencedColumn: 'id',
          },
          {
            table: 'role_permissions',
            column: 'permission_id',
            referencedTable: 'permissions',
            referencedColumn: 'id',
          },
        ],
        columnsByTable: new Map([
          ['users', new Set(['id'])],
          ['user_roles', new Set(['user_id', 'role_id'])],
          ['roles', new Set(['id', 'name'])],
          ['role_permissions', new Set(['role_id', 'permission_id'])],
          ['permissions', new Set(['id', 'name'])],
        ]),
        jsonColumnsByTable: new Map(),
      },
      query,
    });

    expect(tables.get('roles')?.rows).toEqual(
      expect.arrayContaining([
        { id: 'role-a', name: 'ROLE-A' },
        { id: 'role-b', name: 'ROLE-B' },
      ]),
    );
    const userRoleQueries = query.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM "user_roles"'),
    );
    expect(userRoleQueries).toHaveLength(1);
  });

  it('anonimiza referências a usuários externos sem exportar PII cross-tenant', () => {
    const service = makeService({
      dataSource: {},
      privilegedDb: { isEnabled: jest.fn().mockReturnValue(false) },
    });
    const companyId = '11111111-1111-4111-8111-111111111111';
    const externalUserId = '22222222-2222-4222-8222-222222222222';
    const tables = new Map<string, RelatedRowsPayload>([
      [
        'users',
        {
          primaryKeyColumns: ['id'],
          rowCount: 1,
          rows: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              company_id: companyId,
              profile_id: '44444444-4444-4444-8444-444444444444',
            },
          ],
        },
      ],
      [
        'aprs',
        {
          primaryKeyColumns: ['id'],
          rowCount: 1,
          rows: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              company_id: companyId,
              elaborador_id: externalUserId,
              aprovado_por_id: externalUserId,
            },
          ],
        },
      ],
    ]);
    const schema = {
      companyScopedTables: ['users', 'aprs'],
      primaryKeysByTable: new Map([
        ['users', ['id']],
        ['aprs', ['id']],
      ]),
      foreignKeys: [
        {
          table: 'aprs',
          column: 'elaborador_id',
          referencedTable: 'users',
          referencedColumn: 'id',
        },
        {
          table: 'aprs',
          column: 'aprovado_por_id',
          referencedTable: 'users',
          referencedColumn: 'id',
        },
      ],
      columnsByTable: new Map([
        ['users', new Set(['id', 'company_id', 'profile_id'])],
        [
          'aprs',
          new Set(['id', 'company_id', 'elaborador_id', 'aprovado_por_id']),
        ],
      ]),
      jsonColumnsByTable: new Map<string, Set<string>>(),
    };

    const count = (
      service as unknown as TenantBackupServiceRelations
    ).pseudonymizeExternalUserReferences({
      tables,
      schema,
      companyId,
      exportedAt: '2026-07-27T18:00:00.000Z',
    });

    const placeholder = tables.get('users')?.rows[1];
    const apr = tables.get('aprs')?.rows[0];
    expect(count).toBe(1);
    expect(placeholder).toMatchObject({
      company_id: companyId,
      nome: 'Ator histórico externo anonimizado',
      cpf: null,
      email: null,
      status: false,
      access_status: 'no_login',
    });
    expect(placeholder?.id).not.toBe(externalUserId);
    expect(apr?.elaborador_id).toBe(placeholder?.id);
    expect(apr?.aprovado_por_id).toBe(placeholder?.id);
  });
});
