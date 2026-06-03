import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtGeneralRecommendationsChecklist1709000000012 implements MigrationInterface {
  name = 'AddPtGeneralRecommendationsChecklist1709000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "recomendacoes_gerais_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "recomendacoes_gerais_checklist"
    `);
  }
}
