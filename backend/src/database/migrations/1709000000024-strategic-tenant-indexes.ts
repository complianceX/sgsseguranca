import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices estratégicos por tabela multi-tenant:
 *  - (company_id, created_at DESC) para listagens paginadas
 *  - (company_id, status) quando aplicável
 *
 * Observação:
 *  - Alguns índices já existem na migration 1709000000023 com o mesmo nome
 *    (idx_<table>_company_created / idx_<table>_company_status).
 *    Aqui garantimos cobertura para TODAS as tabelas com as colunas-alvo.
 */
export class StrategicTenantIndexes1709000000024 implements MigrationInterface {
  name = 'StrategicTenantIndexes1709000000024';

  // Índices já criados explicitamente na migration 1709000000023 (não remover no down)
  private readonly preexistingCompanyCreated = new Set<string>([
    'users',
    'aprs',
    'pts',
    'dds',
    'checklists',
    'epi_assignments',
    'cats',
    'trainings',
    'signatures',
    'audits',
    'inspections',
    'nonconformities',
    'corrective_actions',
    'reports',
    'mail_logs',
  ]);

  private readonly preexistingCompanyStatus = new Set<string>([
    'users',
    'sites',
    'aprs',
    'pts',
    'checklists',
    'epi_assignments',
    'cats',
    'nonconformities',
    'corrective_actions',
    'contracts',
    'mail_logs',
  ]);

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------------
    // (company_id, created_at DESC) em todas as tabelas que possuem as colunas
    // -----------------------------------------------------------------------
    const createdRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'company_id'
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = c.table_name
            AND c2.column_name = 'created_at'
        )
      ORDER BY c.table_name
    `);

    for (const { table_name } of createdRows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table_name}_company_created"
        ON "${table_name}" ("company_id", "created_at" DESC)
      `);
    }

    // -----------------------------------------------------------------------
    // (company_id, status) em todas as tabelas que possuem as colunas
    // -----------------------------------------------------------------------
    const statusRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'company_id'
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = c.table_name
            AND c2.column_name = 'status'
        )
      ORDER BY c.table_name
    `);

    for (const { table_name } of statusRows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table_name}_company_status"
        ON "${table_name}" ("company_id", "status")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const createdRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'company_id'
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = c.table_name
            AND c2.column_name = 'created_at'
        )
    `);

    for (const { table_name } of createdRows) {
      if (this.preexistingCompanyCreated.has(table_name)) continue;
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_${table_name}_company_created"`,
      );
    }

    const statusRows: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'company_id'
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = c.table_name
            AND c2.column_name = 'status'
        )
    `);

    for (const { table_name } of statusRows) {
      if (this.preexistingCompanyStatus.has(table_name)) continue;
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_${table_name}_company_status"`,
      );
    }
  }
}
