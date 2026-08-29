import * as path from 'node:path';
import { createRequire } from 'node:module';

jest.mock('../../../scripts/migration-history-compatibility', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '../../../scripts/migration-history-compatibility',
  );

  return {
    ...actual,
    ensureMigrationsTable: jest.fn().mockResolvedValue(undefined),
    getCanonicalNameForLegacyName: jest.fn((name: string) =>
      name === 'GrantTenantValidationToSgsAdmin1709000000380'
        ? 'GrantTenantValidationToSgsAdmin1709000000389'
        : '',
    ),
    loadExecutedMigrationRows: jest.fn().mockResolvedValue([
      {
        id: 12,
        timestamp: 1709000000380,
        name: 'GrantTenantValidationToSgsAdmin1709000000380',
      },
    ]),
  };
});

const { loadEnvironmentContract } = createRequire(__filename)(
  '../../../scripts/assert-environment-contract.cjs',
) as {
  loadEnvironmentContract: (options?: { compiledPath?: string }) => {
    validateCommonEnvironment: unknown;
  };
};

import { revertLastMigration } from '../../../scripts/run-migration-revert';

describe('migration revert compatibility', () => {
  it('loads the environment contract when dist is absent', () => {
    const contract = loadEnvironmentContract({
      compiledPath: path.join(__dirname, 'missing-dist-contract.js'),
    });

    expect(typeof contract.validateCommonEnvironment).toBe('function');
  });

  it('resolves a legacy row to the canonical migration before down()', async () => {
    const down = jest.fn().mockResolvedValue(undefined);
    let transactionActive = false;
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockImplementation(() => {
        transactionActive = true;
      }),
      beforeMigration: jest.fn().mockResolvedValue(undefined),
      afterMigration: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockImplementation(() => {
        transactionActive = false;
      }),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      get isTransactionActive() {
        return transactionActive;
      },
    };
    const dataSource = {
      migrations: [
        {
          name: 'GrantTenantValidationToSgsAdmin1709000000389',
          transaction: true,
          down,
        },
      ],
      createQueryRunner: jest.fn(() => queryRunner),
    };

    await revertLastMigration(dataSource);

    expect(down).toHaveBeenCalledWith(queryRunner);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'DELETE FROM "migrations" WHERE "id" = $1',
      [12],
    );
  });
});
