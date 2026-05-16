import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices compostos para tabelas de alto volume ainda não cobertas pelas
 * migrations anteriores (154, 161, 162, 163).
 *
 * mail_logs: gerado a cada e-mail enviado. Com 1.000 empresas e alertas
 *   automáticos diários, pode atingir dezenas de milhões de registros/ano.
 *   (company_id, created_at DESC) → listagem por empresa ordenada por data.
 *   (company_id, status) → jobs de retry/auditoria filtram por status=failed.
 *
 * reports: gerado a cada PDF solicitado. (company_id, created_at DESC) cobre
 *   a listagem principal. (company_id, status) cobre filtros por estado do job.
 *
 * document_imports: (company_id, status, created_at DESC) cobre o padrão de
 *   polling de status e listagem por empresa.
 *
 * transaction = false: CONCURRENTLY exige autocommit.
 */
export class HighVolumeTablesIndexes1709000000164 implements MigrationInterface {
  name = 'HighVolumeTablesIndexes1709000000164';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // mail_logs
    if (
      (await queryRunner.hasTable('mail_logs')) &&
      (await this.hasColumns(queryRunner, 'mail_logs', [
        'company_id',
        'created_at',
      ]))
    ) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_mail_logs_company_created"
        ON "mail_logs" ("company_id", "created_at" DESC)
        WHERE "company_id" IS NOT NULL
      `);
    }

    if (
      (await queryRunner.hasTable('mail_logs')) &&
      (await this.hasColumns(queryRunner, 'mail_logs', [
        'company_id',
        'status',
      ]))
    ) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_mail_logs_company_status"
        ON "mail_logs" ("company_id", "status")
        WHERE "company_id" IS NOT NULL
      `);
    }

    // reports
    if (
      (await queryRunner.hasTable('reports')) &&
      (await this.hasColumns(queryRunner, 'reports', [
        'company_id',
        'created_at',
      ]))
    ) {
      const reportsHasDeletedAt = await queryRunner.hasColumn(
        'reports',
        'deleted_at',
      );
      const reportsActiveWhere = reportsHasDeletedAt
        ? ' WHERE "deleted_at" IS NULL'
        : '';

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_reports_company_created"
        ON "reports" ("company_id", "created_at" DESC)${reportsActiveWhere}
      `);
    }

    if (
      (await queryRunner.hasTable('reports')) &&
      (await this.hasColumns(queryRunner, 'reports', [
        'company_id',
        'status',
        'created_at',
      ]))
    ) {
      const reportsHasDeletedAt = await queryRunner.hasColumn(
        'reports',
        'deleted_at',
      );
      const reportsActiveWhere = reportsHasDeletedAt
        ? ' WHERE "deleted_at" IS NULL'
        : '';

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_reports_company_status_created"
        ON "reports" ("company_id", "status", "created_at" DESC)${reportsActiveWhere}
      `);
    }

    // document_imports
    const documentImportsTenantColumn =
      await this.resolveDocumentImportsTenantColumn(queryRunner);
    if (
      documentImportsTenantColumn &&
      (await this.hasColumns(queryRunner, 'document_imports', [
        documentImportsTenantColumn,
        'status',
        'created_at',
      ]))
    ) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_document_imports_company_status_created"
        ON "document_imports" ("${documentImportsTenantColumn}", "status", "created_at" DESC)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_document_imports_company_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_reports_company_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_reports_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_mail_logs_company_status"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_mail_logs_company_created"`,
    );
  }

  private async hasColumns(
    queryRunner: QueryRunner,
    tableName: string,
    columns: string[],
  ): Promise<boolean> {
    for (const column of columns) {
      if (!(await queryRunner.hasColumn(tableName, column))) {
        return false;
      }
    }

    return true;
  }

  private async resolveDocumentImportsTenantColumn(
    queryRunner: QueryRunner,
  ): Promise<'company_id' | 'empresa_id' | null> {
    if (!(await queryRunner.hasTable('document_imports'))) {
      return null;
    }

    if (await queryRunner.hasColumn('document_imports', 'company_id')) {
      return 'company_id';
    }

    if (await queryRunner.hasColumn('document_imports', 'empresa_id')) {
      return 'empresa_id';
    }

    return null;
  }
}
