import { MigrationInterface, QueryRunner } from 'typeorm';

const TARGET_TABLES = [
  'document_video_attachments',
  'forensic_trail_events',
  'pdf_integrity_records',
  'monthly_snapshots',
] as const;

const POLICY_NAME = 'tenant_isolation_policy';

export class HardenMissingTenantRls1709000000083
  implements MigrationInterface
{
  name = 'HardenMissingTenantRls1709000000083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of TARGET_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`,
      );

      const policyExists = await queryRunner.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = $1
            AND policyname = $2
        ) AS exists
        `,
        [tableName, POLICY_NAME],
      );

      if (Boolean(policyExists[0]?.exists)) {
        continue;
      }

      await queryRunner.query(`
        CREATE POLICY "${POLICY_NAME}"
        ON "${tableName}"
        USING (
          (company_id)::text = (current_company())::text
          OR is_super_admin() = true
        )
        WITH CHECK (
          (company_id)::text = (current_company())::text
          OR is_super_admin() = true
        )
      `);
    }
  }

  public async down(): Promise<void> {
    // No-op intencional:
    // esta migration fortalece RLS em tabelas de produção.
    // evitar remoção automática para não reduzir segurança em rollback.
  }
}
