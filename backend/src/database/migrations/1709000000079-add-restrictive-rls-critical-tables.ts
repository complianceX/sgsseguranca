import { MigrationInterface, QueryRunner } from 'typeorm';

const COMPANY_SCOPED_TABLES = [
  'document_registry',
  'checklists',
  'inspections',
  'cats',
  'signatures',
] as const;

const RESTRICTIVE_POLICY_NAME = 'tenant_guard_public_hardening';

export class AddRestrictiveRlsCriticalTables1709000000079 implements MigrationInterface {
  name = 'AddRestrictiveRlsCriticalTables1709000000079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of COMPANY_SCOPED_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${RESTRICTIVE_POLICY_NAME}" ON "${tableName}"`,
      );
      await queryRunner.query(`
        CREATE POLICY "${RESTRICTIVE_POLICY_NAME}"
        ON "${tableName}"
        AS RESTRICTIVE
        FOR ALL
        USING (
          company_id = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          company_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }

    const hasAprRiskEvidences =
      await queryRunner.hasTable('apr_risk_evidences');
    const hasAprs = await queryRunner.hasTable('aprs');
    if (!hasAprRiskEvidences || !hasAprs) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "${RESTRICTIVE_POLICY_NAME}" ON "apr_risk_evidences"`,
    );
    await queryRunner.query(`
      CREATE POLICY "${RESTRICTIVE_POLICY_NAME}"
      ON "apr_risk_evidences"
      AS RESTRICTIVE
      FOR ALL
      USING (
        is_super_admin() = true
        OR EXISTS (
          SELECT 1
          FROM "aprs" a
          WHERE a.id = "apr_risk_evidences"."apr_id"
            AND a.company_id = current_company()
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR EXISTS (
          SELECT 1
          FROM "aprs" a
          WHERE a.id = "apr_risk_evidences"."apr_id"
            AND a.company_id = current_company()
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of COMPANY_SCOPED_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${RESTRICTIVE_POLICY_NAME}" ON "${tableName}"`,
      );
    }

    if (await queryRunner.hasTable('apr_risk_evidences')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${RESTRICTIVE_POLICY_NAME}" ON "apr_risk_evidences"`,
      );
    }
  }
}
