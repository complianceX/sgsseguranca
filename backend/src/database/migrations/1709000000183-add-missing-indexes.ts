import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes1709000000183 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_company_id" ON "users" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_site_id" ON "users" ("site_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_profile_id" ON "users" ("profile_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_activity_company_id" ON "activities" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_site_company_id" ON "sites" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_checklist_company_id" ON "checklists" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_checklist_site_id" ON "checklists" ("site_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_checklist_inspetor_id" ON "checklists" ("inspetor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_risk_company_id" ON "risks" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_company_id" ON "aprs" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_site_id" ON "aprs" ("site_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_elaborador_id" ON "aprs" ("elaborador_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_auditado_por_id" ON "aprs" ("auditado_por_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_parent_apr_id" ON "aprs" ("parent_apr_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_aprovado_por_id" ON "aprs" ("aprovado_por_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_reprovado_por_id" ON "aprs" ("reprovado_por_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_profile_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activity_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_site_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checklist_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checklist_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checklist_inspetor_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_risk_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_elaborador_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_auditado_por_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_parent_apr_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_aprovado_por_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_reprovado_por_id"`);
  }
}
