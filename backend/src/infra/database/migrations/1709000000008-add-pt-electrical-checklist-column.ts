import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtElectricalChecklistColumn1709000000008 implements MigrationInterface {
  name = 'AddPtElectricalChecklistColumn1709000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "trabalho_eletrico_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "trabalho_eletrico_checklist"
    `);
  }
}
