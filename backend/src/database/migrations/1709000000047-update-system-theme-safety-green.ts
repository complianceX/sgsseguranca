import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atualiza o tema padrão para Safety Green
 * (ANSI Z535 / ISO 3864 / ABNT NBR ISO 3864)
 */
export class UpdateSystemThemeSafetyGreen1709000000047 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE system_theme
      SET
        background_color = '#f4f7fa',
        sidebar_color    = '#0d3d1f',
        card_color       = '#ffffff',
        primary_color    = '#16a34a',
        secondary_color  = '#0052b4',
        text_primary     = '#101828',
        text_secondary   = '#344054',
        success_color    = '#15803d',
        warning_color    = '#d97706',
        danger_color     = '#d92d20',
        info_color       = '#0369a1',
        updated_at       = NOW()
      WHERE 1 = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE system_theme
      SET
        background_color = '#e7f1eb',
        sidebar_color    = '#10202a',
        card_color       = '#ffffff',
        primary_color    = '#1554d1',
        secondary_color  = '#0f766e',
        text_primary     = '#10202a',
        text_secondary   = '#52606d',
        success_color    = '#177245',
        warning_color    = '#b45309',
        danger_color     = '#b42318',
        info_color       = '#0b6e99',
        updated_at       = NOW()
      WHERE 1 = 1
    `);
  }
}
