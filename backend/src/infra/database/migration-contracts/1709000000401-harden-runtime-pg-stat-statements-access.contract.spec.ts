import { QueryRunner } from 'typeorm';
import { HardenRuntimePgStatStatementsAccess1709000000401 } from '../migrations/1709000000401-harden-runtime-pg-stat-statements-access';

describe('0401 provider boundary contract', () => {
  it('skips clean PostgreSQL without Neon-managed provider objects', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        managed_role_exists: false,
        managed_relation_exists: false,
      },
    ]);
    const queryRunner = { query } as unknown as QueryRunner;

    await expect(
      new HardenRuntimePgStatStatementsAccess1709000000401().up(queryRunner),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
