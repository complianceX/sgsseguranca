import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDashboardQuerySnapshots1709000000121
  implements MigrationInterface
{
  name = 'CreateDashboardQuerySnapshots1709000000121';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dashboard_query_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "query_type" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "schema_version" integer NOT NULL DEFAULT 1,
        "generated_at" timestamp NOT NULL,
        "expires_at" timestamp NOT NULL,
        "last_error" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_query_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dashboard_query_snapshots_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_dashboard_query_snapshots_query_type"
          CHECK ("query_type" IN ('summary', 'kpis', 'pending-queue'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dashboard_query_snapshots_company_query"
      ON "dashboard_query_snapshots" ("company_id", "query_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dashboard_query_snapshots_query_expires"
      ON "dashboard_query_snapshots" ("query_type", "expires_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots" FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dashboard_query_snapshots"
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "dashboard_query_snapshots"
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dashboard_query_snapshots"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dashboard_query_snapshots_query_expires"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_dashboard_query_snapshots_company_query"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "dashboard_query_snapshots"
    `);
  }
}
