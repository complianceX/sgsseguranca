import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardening de RLS multi-tenant:
 * - Garante WITH CHECK para INSERT/UPDATE (impede gravar/alterar company_id de outro tenant)
 * - Suporta colunas legado `empresa_id` (quando não existe `company_id` na tabela)
 * - Mantém variáveis de sessão via current_setting('app.current_company_id'|'app.current_company')
 */
export class RlsTenantPolicyWithCheck1709000000029
  implements MigrationInterface
{
  name = 'RlsTenantPolicyWithCheck1709000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1) Helper functions (idempotent via CREATE OR REPLACE)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      DECLARE
        v text;
      BEGIN
        -- Preferir a chave atual
        v := current_setting('app.current_company_id', true);
        IF v IS NULL OR v = '' THEN
          -- Compat: nome alternativo usado em alguns exemplos
          v := current_setting('app.current_company', true);
        END IF;
        IF v IS NULL OR v = '' THEN
          RETURN NULL;
        END IF;
        RETURN v::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // -----------------------------------------------------------------
    // 2) Tabelas multi-tenant com coluna company_id
    // -----------------------------------------------------------------
    const companyRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);

    for (const { table_name } of companyRows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(
        `ALTER TABLE "${table_name}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" FORCE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );

      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${table_name}"
        USING (
          company_id = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          company_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }

    // -----------------------------------------------------------------
    // 3) Tabelas multi-tenant legadas com coluna empresa_id (sem company_id)
    // -----------------------------------------------------------------
    const legacyRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT DISTINCT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'empresa_id'
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns c2
          WHERE c2.table_schema = c.table_schema
            AND c2.table_name = c.table_name
            AND c2.column_name = 'company_id'
        )
      ORDER BY c.table_name
    `);

    for (const { table_name } of legacyRows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(
        `ALTER TABLE "${table_name}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" FORCE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );

      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${table_name}"
        USING (
          empresa_id = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          empresa_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Mantém compatível com rollback: remove apenas a policy; não desabilita RLS.
    const rows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('company_id', 'empresa_id')
      ORDER BY table_name
    `);

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );
    }
  }
}

