import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublicValidationGrants1709000000141 implements MigrationInterface {
  name = 'CreatePublicValidationGrants1709000000141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_validation_grants" (
        "id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "document_code" text NOT NULL,
        "portal" character varying(80) NOT NULL DEFAULT 'public_validation',
        "document_id" uuid,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "disabled_at" TIMESTAMP,
        "last_validated_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_public_validation_grants_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_public_validation_grants_company_code"
      ON "public_validation_grants" ("company_id", "document_code")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_public_validation_grants_active"
      ON "public_validation_grants" ("expires_at", "revoked_at", "disabled_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_public_validation_grants_active"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_public_validation_grants_company_code"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "public_validation_grants"
    `);
  }
}
