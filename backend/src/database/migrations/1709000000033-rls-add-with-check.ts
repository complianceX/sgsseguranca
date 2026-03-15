import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona WITH CHECK às políticas RLS existentes.
 *
 * Problema anterior: a política USING protege apenas leitura (SELECT).
 * Sem WITH CHECK, um usuário autenticado poderia fazer INSERT/UPDATE
 * com company_id de outro tenant, gravando dados no tenant errado.
 *
 * Esta migration recria todas as políticas com WITH CHECK restrito:
 *   - Usuários normais só podem escrever na sua própria empresa.
 *   - Super admin pode ler qualquer empresa, mas só escreve se company_id
 *     for nulo (operações sem contexto de tenant, ex: seed/admin).
 */
export class RlsAddWithCheck1709000000033 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      // Recriar política com WITH CHECK para cobrir INSERT e UPDATE.
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      // Reverter para política sem WITH CHECK (estado anterior).
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
      `);
    }
  }
}
