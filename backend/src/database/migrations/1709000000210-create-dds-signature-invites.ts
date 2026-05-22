import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDdsSignatureInvites1709000000210
  implements MigrationInterface
{
  name = 'CreateDdsSignatureInvites1709000000210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dds_signature_invites" (
        "id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "dds_id" uuid NOT NULL,
        "participant_user_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        "signed_signature_id" uuid,
        "token_hash" character varying(64) NOT NULL,
        "dds_version" integer NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "used_at" TIMESTAMP,
        "last_viewed_at" TIMESTAMP,
        "signed_ip_hash" character varying(64),
        "signed_user_agent_hash" character varying(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dds_signature_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dds_signature_invites_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_dds_signature_invites_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_dds_signature_invites_dds_id"
          FOREIGN KEY ("dds_id") REFERENCES "dds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dds_signature_invites_participant_user_id"
          FOREIGN KEY ("participant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_dds_signature_invites_created_by_user_id"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_dds_signature_invites_signed_signature_id"
          FOREIGN KEY ("signed_signature_id") REFERENCES "signatures"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_company_dds_participant"
      ON "dds_signature_invites" ("company_id", "dds_id", "participant_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_active"
      ON "dds_signature_invites" ("company_id", "expires_at", "revoked_at", "used_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_dds_id"
      ON "dds_signature_invites" ("dds_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "dds_signature_invites" ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE "dds_signature_invites" FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dds_signature_invites"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "dds_signature_invites"
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dds_signature_invites"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dds_signature_invites_dds_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dds_signature_invites_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dds_signature_invites_company_dds_participant"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "dds_signature_invites"
    `);
  }
}
