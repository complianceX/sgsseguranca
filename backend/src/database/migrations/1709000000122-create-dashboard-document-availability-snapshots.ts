import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDashboardDocumentAvailabilitySnapshots1709000000122
  implements MigrationInterface
{
  name = 'CreateDashboardDocumentAvailabilitySnapshots1709000000122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dashboard_document_availability_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "pendency_type" varchar(64) NOT NULL,
        "snapshot_kind" varchar(64) NOT NULL,
        "module" varchar(64) NOT NULL,
        "object_key" text NOT NULL,
        "document_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "file_key" text NOT NULL,
        "original_name" text NULL,
        "document_code" text NULL,
        "title" text NULL,
        "status" varchar(120) NULL,
        "relevant_date" timestamp NULL,
        "attachment_id" varchar(64) NULL,
        "attachment_index" integer NULL,
        "availability_status" varchar(64) NOT NULL DEFAULT 'ready',
        "last_checked_at" timestamp NOT NULL DEFAULT now(),
        "last_error" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_doc_availability_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dashboard_doc_availability_snapshots_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_dashboard_doc_availability_pendency_type"
          CHECK ("pendency_type" IN ('degraded_document_availability', 'unavailable_governed_attachment')),
        CONSTRAINT "CHK_dashboard_doc_availability_snapshot_kind"
          CHECK ("snapshot_kind" IN ('registry_document', 'cat_attachment', 'nonconformity_attachment')),
        CONSTRAINT "CHK_dashboard_doc_availability_status"
          CHECK ("availability_status" IN ('ready', 'registered_without_signed_url'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dashboard_doc_availability_scope"
      ON "dashboard_document_availability_snapshots" ("company_id", "snapshot_kind", "object_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dashboard_doc_availability_lookup"
      ON "dashboard_document_availability_snapshots" (
        "company_id",
        "pendency_type",
        "module",
        "availability_status",
        "last_checked_at"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dashboard_doc_availability_document"
      ON "dashboard_document_availability_snapshots" ("company_id", "module", "document_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_document_availability_snapshots" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_document_availability_snapshots" FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dashboard_document_availability_snapshots"
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "dashboard_document_availability_snapshots"
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
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dashboard_document_availability_snapshots"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dashboard_doc_availability_document"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dashboard_doc_availability_lookup"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_dashboard_doc_availability_scope"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "dashboard_document_availability_snapshots"
    `);
  }
}
