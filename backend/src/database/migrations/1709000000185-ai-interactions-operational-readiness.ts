import { MigrationInterface, QueryRunner } from 'typeorm';

const FUTURE_AI_INTERACTION_PARTITIONS = [
  ['ai_interactions_2026_08', '2026-08-01', '2026-09-01'],
  ['ai_interactions_2026_09', '2026-09-01', '2026-10-01'],
  ['ai_interactions_2026_10', '2026-10-01', '2026-11-01'],
  ['ai_interactions_2026_11', '2026-11-01', '2026-12-01'],
  ['ai_interactions_2026_12', '2026-12-01', '2027-01-01'],
  ['ai_interactions_2027_01', '2027-01-01', '2027-02-01'],
  ['ai_interactions_2027_02', '2027-02-01', '2027-03-01'],
  ['ai_interactions_2027_03', '2027-03-01', '2027-04-01'],
] as const;

export class AiInteractionsOperationalReadiness1709000000185 implements MigrationInterface {
  name = 'AiInteractionsOperationalReadiness1709000000185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      return;
    }

    const partitionStatus = (await queryRunner.query(`
      SELECT relkind
      FROM pg_class
      WHERE oid = 'public.ai_interactions'::regclass
      LIMIT 1
    `)) as Array<{ relkind: string }>;

    if (partitionStatus[0]?.relkind !== 'p') {
      return;
    }

    for (const [
      partitionName,
      startDate,
      endDate,
    ] of FUTURE_AI_INTERACTION_PARTITIONS) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${partitionName}"
        PARTITION OF "ai_interactions"
        FOR VALUES FROM ('${startDate}') TO ('${endDate}')
      `);
      await this.enforcePartitionRls(queryRunner, partitionName);
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_interactions_user_uuid_created"
      ON "ai_interactions" ("user_uuid", "created_at" DESC)
      WHERE "user_uuid" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_interactions_tenant_uuid_user_uuid_created"
      ON "ai_interactions" ("tenant_uuid", "user_uuid", "created_at" DESC)
      WHERE "tenant_uuid" IS NOT NULL
        AND "user_uuid" IS NOT NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "ai_interactions" IS
      'Partitioned AI interaction audit table. Future partitions through 2027-03 and UUID FK support indexes are managed by migration 1709000000185.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_uuid_user_uuid_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_user_uuid_created"`,
    );

    for (const [
      partitionName,
    ] of FUTURE_AI_INTERACTION_PARTITIONS.slice().reverse()) {
      if (!(await queryRunner.hasTable(partitionName))) {
        continue;
      }

      const rows = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM "${partitionName}"`,
      )) as Array<{ total: number }>;

      if (Number(rows[0]?.total ?? 0) === 0) {
        await queryRunner.query(`DROP TABLE IF EXISTS "${partitionName}"`);
      }
    }

    await queryRunner.query(`
      COMMENT ON TABLE "ai_interactions" IS NULL
    `);
  }

  private async enforcePartitionRls(
    queryRunner: QueryRunner,
    partitionName: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${partitionName}" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "${partitionName}" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "${partitionName}"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation"
      ON "${partitionName}"
      FOR ALL
      USING (
        ("tenant_id")::text = (current_company())::text
        OR is_super_admin() = true
      )
      WITH CHECK (
        ("tenant_id")::text = (current_company())::text
        OR is_super_admin() = true
      )
    `);
  }
}
