import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportGeneratedByAndUnique1709000000319 implements MigrationInterface {
  name = 'AddReportGeneratedByAndUnique1709000000319';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add generated_by column
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "generated_by" uuid
    `);

    // Add FK to users (nullable)
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD CONSTRAINT "FK_reports_generated_by" 
      FOREIGN KEY ("generated_by") 
      REFERENCES "users"("id") 
      ON DELETE SET NULL 
      ON UPDATE NO ACTION
    `);

    // Partial unique index to prevent duplicate (company, mes, ano) active reports
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reports_company_mes_ano_active"
      ON "reports" (company_id, mes, ano)
      WHERE (deleted_at IS NULL)
    `);

    // Helpful index for lookup by generated_by
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reports_generated_by"
      ON "reports" ("generated_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_reports_generated_by"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_reports_company_mes_ano_active"
    `);

    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP CONSTRAINT IF EXISTS "FK_reports_generated_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "generated_by"
    `);
  }
}
