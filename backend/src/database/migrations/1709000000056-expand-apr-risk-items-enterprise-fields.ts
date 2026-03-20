import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandAprRiskItemsEnterpriseFields1709000000056 implements MigrationInterface {
  name = 'ExpandAprRiskItemsEnterpriseFields1709000000056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('apr_risk_items');
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      ADD COLUMN IF NOT EXISTS "responsavel" text
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      ADD COLUMN IF NOT EXISTS "prazo" date
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      ADD COLUMN IF NOT EXISTS "status_acao" character varying(60)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('apr_risk_items');
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      DROP COLUMN IF EXISTS "status_acao"
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      DROP COLUMN IF EXISTS "prazo"
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
      DROP COLUMN IF EXISTS "responsavel"
    `);
  }
}
