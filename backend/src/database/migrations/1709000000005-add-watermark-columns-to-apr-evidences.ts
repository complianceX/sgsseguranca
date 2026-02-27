import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWatermarkColumnsToAprEvidences1709000000005 implements MigrationInterface {
  name = 'AddWatermarkColumnsToAprEvidences1709000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" ADD COLUMN IF NOT EXISTS "watermarked_file_key" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" ADD COLUMN IF NOT EXISTS "watermarked_hash_sha256" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" ADD COLUMN IF NOT EXISTS "watermark_text" text`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_watermarked_hash" ON "apr_risk_evidences" ("watermarked_hash_sha256")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_watermarked_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP COLUMN IF EXISTS "watermark_text"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP COLUMN IF EXISTS "watermarked_hash_sha256"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_evidences" DROP COLUMN IF EXISTS "watermarked_file_key"`,
    );
  }
}
