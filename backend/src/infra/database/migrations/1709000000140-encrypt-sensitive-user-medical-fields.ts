import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptSensitiveUserMedicalFields1709000000140 implements MigrationInterface {
  name = 'EncryptSensitiveUserMedicalFields1709000000140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "cpf_hash" character varying(64),
        ADD COLUMN IF NOT EXISTS "cpf_ciphertext" text
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_cpf_hash_not_null"
      ON "users" ("cpf_hash")
      WHERE "cpf_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_users_cpf_hash_not_null"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "cpf_ciphertext",
        DROP COLUMN IF EXISTS "cpf_hash"
    `);
  }
}
