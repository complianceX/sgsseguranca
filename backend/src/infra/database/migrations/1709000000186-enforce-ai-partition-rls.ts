import { MigrationInterface, QueryRunner } from 'typeorm';

type PartitionRow = {
  partition_name: string;
};

export class EnforceAiPartitionRls1709000000186 implements MigrationInterface {
  name = 'EnforceAiPartitionRls1709000000186';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      return;
    }

    const partitions = (await queryRunner.query(`
      SELECT child.relname AS partition_name
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_class child ON child.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      WHERE parent.oid = 'public.ai_interactions'::regclass
        AND n.nspname = 'public'
      ORDER BY child.relname
    `)) as PartitionRow[];

    for (const partition of partitions) {
      await this.enforcePartitionRls(queryRunner, partition.partition_name);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op. Disabling RLS on partition children would weaken
    // tenant isolation and is not a safe rollback path.
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
