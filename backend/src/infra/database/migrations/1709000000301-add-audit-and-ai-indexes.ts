import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditAndAiIndexes1709000000301 implements MigrationInterface {
  name = 'AddAuditAndAiIndexes1709000000301';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_tenant_timestamp"
      ON "audit_logs" ("companyId", "timestamp")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_audit_logs_tenant_timestamp"
    `);
  }
}
