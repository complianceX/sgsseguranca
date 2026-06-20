import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToRemainingTables1709000000306
  implements MigrationInterface
{
  name = 'AddDeletedAtToRemainingTables1709000000306';

  // CREATE INDEX CONCURRENTLY exige migration fora de transacao.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona deleted_at nas tabelas multi-tenant que ainda nao tinham a coluna,
    // permitindo que deleteCompanyData as descubra via information_schema discovery.
    await queryRunner.query(`
      ALTER TABLE "signatures"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "epi_assignments"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    // document_registry pode ja ter a coluna (referenciada em raw SQL);
    // IF NOT EXISTS garante idempotencia.
    await queryRunner.query(`
      ALTER TABLE "document_registry"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_signatures_deleted_at"
      ON "signatures" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_epi_assignments_deleted_at"
      ON "epi_assignments" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_reports_deleted_at"
      ON "reports" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_document_registry_deleted_at"
      ON "document_registry" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_document_registry_deleted_at"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_reports_deleted_at"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_epi_assignments_deleted_at"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_signatures_deleted_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE "document_registry" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "signatures" DROP COLUMN IF EXISTS "deleted_at"`,
    );
  }

  private async executeBestEffort(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error) {
      if (this.isOwnershipError(error)) {
        return;
      }
      throw error;
    }
  }

  private isOwnershipError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /must be owner of table/i.test(message) ||
      /must be owner of relation/i.test(message) ||
      /must be owner of index/i.test(message)
    );
  }
}