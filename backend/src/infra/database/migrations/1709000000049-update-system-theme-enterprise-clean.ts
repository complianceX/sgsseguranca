import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração 049 — Safety Green Enterprise Clean
 *
 * Atualiza o registro de system_theme para a nova paleta "enterprise clean":
 * cores mais escuras e sóbrias, melhor hierarquia visual, alinhadas com
 * o redesign do frontend (tokens.css v2 e theme-light.css v2).
 *
 * Contexto: a migration 047 havia definido a paleta Safety Green original
 * (#16a34a). Esta migração atualiza para os novos valores que correspondem
 * aos tokens CSS já em produção no frontend.
 */
export class UpdateSystemThemeEnterpriseClean1709000000049 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE system_theme
      SET
        background_color = '#f7f8fa',
        sidebar_color    = '#183a2c',
        card_color       = '#ffffff',
        primary_color    = '#1e6b43',
        secondary_color  = '#274c77',
        text_primary     = '#111827',
        text_secondary   = '#5f6b79',
        success_color    = '#2e7d32',
        warning_color    = '#b7791f',
        danger_color     = '#c0392b',
        info_color       = '#3b6b93',
        updated_at       = NOW()
      WHERE 1 = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
