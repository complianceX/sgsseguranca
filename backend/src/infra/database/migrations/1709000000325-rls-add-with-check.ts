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
export class RlsAddWithCheck1709000000325 implements MigrationInterface {
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

      // Recriar política com WITH CHECK para cobrir INSERT e UPDATE.
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );

      // A comparação é feita em texto porque nem toda tabela declara
      // `company_id` como uuid (ex.: `ai_interactions` e suas partições usam
      // varchar). Sem o cast, o PostgreSQL aborta com "operador não existe:
      // character varying = uuid" e a cadeia de migrations trava num banco
      // criado do zero.
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

      // Reverter para política sem WITH CHECK (estado anterior).
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
