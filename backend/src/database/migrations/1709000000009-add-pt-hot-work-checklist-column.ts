import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtHotWorkChecklistColumn1709000000009 implements MigrationInterface {
  name = 'AddPtHotWorkChecklistColumn1709000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "trabalho_quente_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "trabalho_quente_checklist"
    `);
  }
}
