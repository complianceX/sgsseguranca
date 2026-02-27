import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtConfinedSpaceChecklistColumn1709000000010 implements MigrationInterface {
  name = 'AddPtConfinedSpaceChecklistColumn1709000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "trabalho_espaco_confinado_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "trabalho_espaco_confinado_checklist"
    `);
  }
}
