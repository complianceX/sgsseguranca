import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditAndAiIndexes1709000000301 implements MigrationInterface {
  name = 'AddAuditAndAiIndexes1709000000301';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_tenant_timestamp"
      ON "audit_logs" ("companyId", "timestamp")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_tenant_timestamp"
    `);
  }
}
