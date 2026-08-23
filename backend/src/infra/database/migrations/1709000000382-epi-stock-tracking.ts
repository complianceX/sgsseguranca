import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SGS-EPI-BR-007: add quantidade_estoque (nullable INT) to epis.
 *
 * NULL means stock tracking is disabled for that EPI (backward-compatible with
 * all existing records). When a non-null value is set, the service layer enforces
 * stock sufficiency on delivery and adjusts the balance on return/replacement.
 */
export class EpiStockTracking1709000000382 implements MigrationInterface {
  name = 'EpiStockTracking1709000000382';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "epis"
        ADD COLUMN IF NOT EXISTS "quantidade_estoque" INT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "epis" DROP COLUMN IF EXISTS "quantidade_estoque";
    `);
  }
}
