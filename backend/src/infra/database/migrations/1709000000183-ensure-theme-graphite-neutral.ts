import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garante que o tema graphite-neutral esteja aplicado.
 *
 * Resolve o conflito de timestamp com 1709000000050-update-system-theme-graphite-neutral.ts,
 * que pode nunca ter sido executado em ambientes que já tinham
 * 1709000000050-add-signature-pin-to-users.ts registrado.
 *
 * O UPDATE é idempotente — pode ser re-executado sem efeitos colaterais.
 */
export class EnsureThemeGraphiteNeutral1709000000183 implements MigrationInterface {
  name = 'EnsureThemeGraphiteNeutral1709000000183';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('system_theme');
    if (!hasTable) return;

    await queryRunner.query(`
      UPDATE system_theme
      SET
        background_color = '#F5F5F4',
        sidebar_color    = '#2F2B28',
        card_color       = '#FFFFFF',
        primary_color    = '#4A443F',
        secondary_color  = '#6C6661',
        text_primary     = '#2F2B28',
        text_secondary   = '#66615B',
        success_color    = '#18895B',
        warning_color    = '#B9771E',
        danger_color     = '#C84A4A',
        info_color       = '#6E6862',
        updated_at       = NOW()
      WHERE 1 = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('system_theme');
    if (!hasTable) return;

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
}
