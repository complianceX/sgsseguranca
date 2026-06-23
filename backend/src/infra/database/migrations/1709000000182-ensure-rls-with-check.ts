import { MigrationInterface, QueryRunner } from 'typeorm';

type InformationSchemaTableRow = {
  table_name: string;
};

function isInformationSchemaTableRow(
  value: unknown,
): value is InformationSchemaTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'table_name' in value &&
    typeof (value as { table_name?: unknown }).table_name === 'string'
  );
}

/**
 * Garante que todas as políticas RLS tenham WITH CHECK para proteger INSERT/UPDATE.
 *
 * Este arquivo resolve o conflito de timestamp com 1709000000033-rls-add-with-check.ts,
 * que pode nunca ter sido executado em ambientes que já tinham
 * 1709000000033-fix-ai-interactions-rls-policy.ts registrado.
 *
 * A operação é idempotente: DROP POLICY IF EXISTS + CREATE garante que a política
 * estará no estado correto independentemente do histórico de migrations.
 */
export class EnsureRlsWithCheck1709000000182 implements MigrationInterface {
  name = 'EnsureRlsWithCheck1709000000182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );

      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${table_name}"
        USING (
          company_id::text = current_company()::text
          OR is_super_admin() = true
        )
        WITH CHECK (
          company_id::text = current_company()::text
          OR is_super_admin() = true
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );

      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${table_name}"
        USING (
          company_id::text = current_company()::text
          OR is_super_admin() = true
        )
      `);
    }
  }
}
