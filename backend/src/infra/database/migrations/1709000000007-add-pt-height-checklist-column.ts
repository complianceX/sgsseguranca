import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtHeightChecklistColumn1709000000007 implements MigrationInterface {
  name = 'AddPtHeightChecklistColumn1709000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "trabalho_altura_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "trabalho_altura_checklist"
    `);
  }
}
