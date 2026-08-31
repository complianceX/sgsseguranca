import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HardenMaterializedViewRuntimeAccess1709000000394 } from '../migrations/1709000000394-harden-materialized-view-runtime-access';

const migrationSource = readFileSync(
  join(
    __dirname,
    '../migrations/1709000000394-harden-materialized-view-runtime-access.ts',
  ),
  'utf8',
);

describe('HardenMaterializedViewRuntimeAccess1709000000394 contract', () => {
  it('uses PG17 MAINTAIN without transferring ownership', () => {
    expect(migrationSource).toContain('GRANT SELECT, MAINTAIN ON TABLE');
    expect(migrationSource).toContain('owner');
    expect(migrationSource).not.toMatch(
      /ALTER MATERIALIZED VIEW[\s\S]*OWNER TO/,
    );
    expect(migrationSource).not.toContain('SET ROLE');
    expect(migrationSource).not.toMatch(/GRANT ALL PRIVILEGES/);
  });

  it('covers the known materialized views and fails closed for runtime ownership', () => {
    expect(migrationSource).toContain('company_dashboard_metrics');
    expect(migrationSource).toContain('apr_risk_rankings');
    expect(migrationSource).toContain("relation.owner === 'sgs_app'");
    expect(migrationSource).toContain("relkind !== 'm'");
    expect(migrationSource).toContain('REVOKE ALL PRIVILEGES ON TABLE public.');
    expect(migrationSource).toContain('FROM PUBLIC, sgs_app');
  });

  it('preserves the five administrative base-table SELECT grants', () => {
    for (const tableName of [
      'companies',
      'aprs',
      'pts',
      'nonconformities',
      'trainings',
    ]) {
      expect(migrationSource).toContain(`public.${tableName}`);
    }
    expect(migrationSource).toContain('GRANT SELECT ON TABLE');
  });

  it('keeps down() non-escalating and side-effect free', async () => {
    const queryRunner = { query: jest.fn() };

    await new HardenMaterializedViewRuntimeAccess1709000000394().down(
      queryRunner as never,
    );

    expect(queryRunner.query).not.toHaveBeenCalled();
    expect(migrationSource).not.toMatch(
      /GRANT (?:ALL|SELECT)[\s\S]*TO sgs_app/,
    );
  });
});
