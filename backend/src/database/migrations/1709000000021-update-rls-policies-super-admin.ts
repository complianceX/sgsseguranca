import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRlsPoliciesSuperAdmin1709000000021 implements MigrationInterface {
  name = 'UpdateRlsPoliciesSuperAdmin1709000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Primeiro garantir que a função is_super_admin existe
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin() 
      RETURNS boolean AS $$
      BEGIN 
        RETURN current_setting('app.is_super_admin', true)::boolean; 
      EXCEPTION 
        WHEN others THEN 
          RETURN false; 
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

      // Atualizar a policy tenant_isolation_policy para incluir bypass de super admin
      await queryRunner.query(
        `
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation_policy'
          ) THEN
            EXECUTE format('
              ALTER TABLE %I DROP POLICY tenant_isolation_policy;
              CREATE POLICY tenant_isolation_policy ON %I 
              USING (company_id = current_company() OR is_super_admin() = true)',
              $1, $1
            );
          END IF;
        END $$;
      `,
        [table],
      );

      // Atualizar a policy deny_without_tenant para incluir bypass de super admin
      await queryRunner.query(
        `
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'deny_without_tenant'
          ) THEN
            EXECUTE format('
              ALTER TABLE %I DROP POLICY deny_without_tenant;
              CREATE POLICY deny_without_tenant ON %I 
              USING (current_company() IS NOT NULL OR is_super_admin() = true)',
              $1, $1
            );
          END IF;
        END $$;
      `,
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

      // Reverter as policies para a versão original sem super admin
      await queryRunner.query(
        `
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation_policy'
          ) THEN
            EXECUTE format('
              ALTER TABLE %I DROP POLICY tenant_isolation_policy;
              CREATE POLICY tenant_isolation_policy ON %I 
              USING (company_id = current_company())',
              $1, $1
            );
          END IF;
        END $$;
      `,
        [table],
      );

      await queryRunner.query(
        `
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'deny_without_tenant'
          ) THEN
            EXECUTE format('
              ALTER TABLE %I DROP POLICY deny_without_tenant;
              CREATE POLICY deny_without_tenant ON %I 
              USING (current_company() IS NOT NULL)',
              $1, $1
            );
          END IF;
        END $$;
      `,
        [table],
      );
    }
  }
}
