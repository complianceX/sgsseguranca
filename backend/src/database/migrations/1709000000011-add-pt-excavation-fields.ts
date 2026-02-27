import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtExcavationFields1709000000011 implements MigrationInterface {
  name = 'AddPtExcavationFields1709000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "escavacao" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "trabalho_escavacao_checklist" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "trabalho_escavacao_checklist"
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "escavacao"
    `);
  }
}
