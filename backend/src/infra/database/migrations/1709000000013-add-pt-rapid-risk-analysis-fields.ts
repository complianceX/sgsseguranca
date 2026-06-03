import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtRapidRiskAnalysisFields1709000000013 implements MigrationInterface {
  name = 'AddPtRapidRiskAnalysisFields1709000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "analise_risco_rapida_checklist" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "analise_risco_rapida_observacoes" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "analise_risco_rapida_observacoes"
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "analise_risco_rapida_checklist"
    `);
  }
}
