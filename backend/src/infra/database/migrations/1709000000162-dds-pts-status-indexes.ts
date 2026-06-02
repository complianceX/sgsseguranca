import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices de escalabilidade para dds e pts.
 *
 * Migration 063 já criou (company_id, created_at) sem status nem soft-delete.
 * Estes índices cobrem o padrão de listagem com filtro de status:
 *   WHERE company_id = ? AND status = ? AND deleted_at IS NULL
 *   ORDER BY created_at DESC
 *
 * transaction = false: CONCURRENTLY exige autocommit.
 */
export class DdsPtsStatusIndexes1709000000162 implements MigrationInterface {
  name = 'DdsPtsStatusIndexes1709000000162';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('dds')) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_dds_company_status_created"
        ON "dds" ("company_id", "status", "created_at" DESC)
        WHERE "deleted_at" IS NULL
      `);
    }

    if (await queryRunner.hasTable('pts')) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_pts_company_status_created"
        ON "pts" ("company_id", "status", "created_at" DESC)
        WHERE "deleted_at" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_pts_company_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_dds_company_status_created"`,
    );
  }
}
