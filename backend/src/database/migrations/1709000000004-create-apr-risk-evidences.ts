import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAprRiskEvidences1709000000004 implements MigrationInterface {
  name = 'CreateAprRiskEvidences1709000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_risk_evidences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apr_id" uuid NOT NULL,
        "apr_risk_item_id" uuid NOT NULL,
        "uploaded_by_id" uuid,
        "file_key" text NOT NULL,
        "original_name" text,
        "mime_type" character varying(100) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "hash_sha256" character varying(64) NOT NULL,
        "captured_at" TIMESTAMP,
        "uploaded_at" TIMESTAMP NOT NULL DEFAULT now(),
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "accuracy_m" numeric(10,2),
        "device_id" character varying(120),
        "ip_address" character varying(64),
        "exif_datetime" TIMESTAMP,
        "integrity_flags" jsonb,
        CONSTRAINT "PK_apr_risk_evidences_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_apr_id" ON "apr_risk_evidences" ("apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_item_id" ON "apr_risk_evidences" ("apr_risk_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_hash" ON "apr_risk_evidences" ("hash_sha256")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_uploaded_at" ON "apr_risk_evidences" ("uploaded_at")`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_apr_risk_evidences_apr_id'
        ) THEN
          ALTER TABLE "apr_risk_evidences"
          ADD CONSTRAINT "FK_apr_risk_evidences_apr_id"
          FOREIGN KEY ("apr_id") REFERENCES "aprs"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_apr_risk_evidences_item_id'
        ) THEN
          ALTER TABLE "apr_risk_evidences"
          ADD CONSTRAINT "FK_apr_risk_evidences_item_id"
          FOREIGN KEY ("apr_risk_item_id") REFERENCES "apr_risk_items"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_apr_risk_evidences_uploaded_by_id'
        ) THEN
          ALTER TABLE "apr_risk_evidences"
          ADD CONSTRAINT "FK_apr_risk_evidences_uploaded_by_id"
          FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP CONSTRAINT IF EXISTS "FK_apr_risk_evidences_uploaded_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP CONSTRAINT IF EXISTS "FK_apr_risk_evidences_item_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP CONSTRAINT IF EXISTS "FK_apr_risk_evidences_apr_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_uploaded_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_item_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_apr_id"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "apr_risk_evidences"`);
  }
}
