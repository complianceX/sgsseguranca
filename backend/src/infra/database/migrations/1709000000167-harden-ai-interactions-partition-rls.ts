import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAiInteractionsPartitionRls1709000000167 implements MigrationInterface {
  name = 'HardenAiInteractionsPartitionRls1709000000167';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        rel record;
      BEGIN
        FOR rel IN
          SELECT c.oid::regclass::text AS relation_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p')
            AND (
              c.relname = 'ai_interactions'
              OR c.relname = 'ai_interactions_default'
              OR c.relname LIKE 'ai_interactions\\_%' ESCAPE '\\'
            )
        LOOP
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', rel.relation_name);
          EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', rel.relation_name);
          EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %s', rel.relation_name);
          EXECUTE format(
            'CREATE POLICY "tenant_isolation" ON %s USING ("tenant_id"::text = current_company()::text OR is_super_admin() = true) WITH CHECK ("tenant_id"::text = current_company()::text OR is_super_admin() = true)',
            rel.relation_name
          );
        END LOOP;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        rel record;
      BEGIN
        FOR rel IN
          SELECT c.oid::regclass::text AS relation_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p')
            AND (
              c.relname = 'ai_interactions'
              OR c.relname = 'ai_interactions_default'
              OR c.relname LIKE 'ai_interactions\\_%' ESCAPE '\\'
            )
        LOOP
          EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %s', rel.relation_name);
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', rel.relation_name);
          EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', rel.relation_name);
          EXECUTE format(
            'CREATE POLICY "tenant_isolation" ON %s USING ("tenant_id" = current_setting(''app.tenant_id'', true))',
            rel.relation_name
          );
        END LOOP;
      END $$
    `);
  }
}
