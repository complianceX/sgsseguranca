import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrepareRlsPolicies1709000000020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dbResult = (await queryRunner.query(
      'SELECT current_database() as name',
    )) as Array<{ name: string }>;
    const dbName = dbResult?.[0]?.name;
    if (dbName) {
      await queryRunner.query(
        `ALTER DATABASE "${dbName}" SET app.current_company_id TO ''`,
      );
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id')::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    const tables = [
      'users',
      'sites',
      'activities',
      'risks',
      'epis',
      'tools',
      'machines',
      'aprs',
      'pts',
      'dds',
      'checklists',
      'signatures',
      'inspections',
      'nonconformities',
      'cats',
      'corrective_actions',
      'trainings',
      'reports',
    ];

    for (const table of tables) {
      const hasTable = await queryRunner.hasTable(table);
      if (!hasTable) continue;

      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(
        `DO $$ BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation_policy'
           ) THEN
             EXECUTE format(
               'CREATE POLICY tenant_isolation_policy ON %I USING (company_id = current_company())',
               $1
             );
           END IF;
         END $$;`,
        [table],
      );

      await queryRunner.query(
        `DO $$ BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'deny_without_tenant'
           ) THEN
             EXECUTE format(
               'CREATE POLICY deny_without_tenant ON %I USING (current_company() IS NOT NULL)',
               $1
             );
           END IF;
         END $$;`,
        [table],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'users',
      'sites',
      'activities',
      'risks',
      'epis',
      'tools',
      'machines',
      'aprs',
      'pts',
      'dds',
      'checklists',
      'signatures',
      'inspections',
      'nonconformities',
      'cats',
      'corrective_actions',
      'trainings',
      'reports',
    ];

    for (const table of tables) {
      const hasTable = await queryRunner.hasTable(table);
      if (!hasTable) continue;

      await queryRunner.query(
        `DO $$ BEGIN
           IF EXISTS (
             SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation_policy'
           ) THEN
             EXECUTE format('DROP POLICY tenant_isolation_policy ON %I', $1);
           END IF;
         END $$;`,
        [table],
      );

      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(
        `DO $$ BEGIN
           IF EXISTS (
             SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'deny_without_tenant'
           ) THEN
             EXECUTE format('DROP POLICY deny_without_tenant ON %I', $1);
           END IF;
         END $$;`,
        [table],
      );
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS current_company()`);
  }
}
