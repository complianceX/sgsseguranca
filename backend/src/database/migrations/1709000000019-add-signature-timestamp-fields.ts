import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignatureTimestampFields1709000000019 implements MigrationInterface {
  name = 'AddSignatureTimestampFields1709000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "signatures"
      ADD COLUMN IF NOT EXISTS "company_id" uuid,
      ADD COLUMN IF NOT EXISTS "signature_hash" character varying,
      ADD COLUMN IF NOT EXISTS "timestamp_token" text,
      ADD COLUMN IF NOT EXISTS "timestamp_authority" character varying,
      ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "integrity_payload" jsonb
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_signatures_company_created_at"
      ON "signatures" ("company_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_signatures_company_id'
        ) THEN
          ALTER TABLE "signatures"
          ADD CONSTRAINT "FK_signatures_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signatures" DROP CONSTRAINT IF EXISTS "FK_signatures_company_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_signatures_company_created_at"`,
    );
    await queryRunner.query(`
      ALTER TABLE "signatures"
      DROP COLUMN IF EXISTS "integrity_payload",
      DROP COLUMN IF EXISTS "signed_at",
      DROP COLUMN IF EXISTS "timestamp_authority",
      DROP COLUMN IF EXISTS "timestamp_token",
      DROP COLUMN IF EXISTS "signature_hash",
      DROP COLUMN IF EXISTS "company_id"
    `);
  }
}
