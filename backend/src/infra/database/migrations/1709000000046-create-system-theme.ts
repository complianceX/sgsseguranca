import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemTheme1709000000046 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_theme" (
        "id"                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "background_color"  varchar NOT NULL DEFAULT '#122318',
        "sidebar_color"     varchar NOT NULL DEFAULT '#0b1710',
        "card_color"        varchar NOT NULL DEFAULT '#183224',
        "primary_color"     varchar NOT NULL DEFAULT '#22c55e',
        "secondary_color"   varchar NOT NULL DEFAULT '#16a34a',
        "text_primary"      varchar NOT NULL DEFAULT '#e2e8f0',
        "text_secondary"    varchar NOT NULL DEFAULT '#b8c5d8',
        "success_color"     varchar NOT NULL DEFAULT '#4ade80',
        "warning_color"     varchar NOT NULL DEFAULT '#facc15',
        "danger_color"      varchar NOT NULL DEFAULT '#f87171',
        "info_color"        varchar NOT NULL DEFAULT '#60a5fa',
        "updated_at"        timestamp DEFAULT now() NOT NULL
      )
    `);

    /* Seed com tema padrão — tabela singleton */
    await queryRunner.query(`
      INSERT INTO "system_theme" (
        "background_color", "sidebar_color", "card_color",
        "primary_color", "secondary_color", "text_primary", "text_secondary",
        "success_color", "warning_color", "danger_color", "info_color"
      ) VALUES (
        '#122318', '#0b1710', '#183224',
        '#22c55e', '#16a34a', '#e2e8f0', '#b8c5d8',
        '#4ade80', '#facc15', '#f87171', '#60a5fa'
      )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "system_theme"`);
  }
}
