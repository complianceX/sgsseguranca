import { MigrationInterface, QueryRunner } from 'typeorm';

const SITE_SCOPED_TABLES = [
  'aprs',
  'arrs',
  'audits',
  'cats',
  'checklists',
  'corrective_actions',
  'dashboard_document_availability_snapshots',
  'dds',
  'dids',
  'epi_assignments',
  'inspections',
  'monthly_snapshots',
  'nonconformities',
  'pts',
  'rdos',
  'service_orders',
] as const;

export class HardenSiteScopePoliciesAndDropDuplicateIndexes1709000000172 implements MigrationInterface {
  name = 'HardenSiteScopePoliciesAndDropDuplicateIndexes1709000000172';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of SITE_SCOPED_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_guard_public_hardening" ON "${tableName}"`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${tableName}"`,
      );
    }

    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_logs_user_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_logs_company_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_dds_company_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_pts_company_status_created"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of SITE_SCOPED_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${tableName}"
        FOR ALL
        USING (company_id = current_company() OR is_super_admin() = true)
        WITH CHECK (company_id = current_company() OR is_super_admin() = true)
      `);
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_user_timestamp"
      ON "audit_logs" ("userId", "timestamp" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_company_timestamp"
      ON "audit_logs" ("companyId", "timestamp" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dds_company_status_created"
      ON "dds" ("company_id", "status", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_status_created"
      ON "pts" ("company_id", "status", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
  }
}
