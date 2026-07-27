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
});
