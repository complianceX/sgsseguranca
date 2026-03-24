import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiProcessingConsentToUsers1709000000064 implements MigrationInterface {
  name = 'AddAiProcessingConsentToUsers1709000000064';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "ai_processing_consent" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "ai_processing_consent"
    `);
  }
}
