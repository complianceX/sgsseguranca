import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertSettingsToCompanies1709000000069 implements MigrationInterface {
  name = 'AddAlertSettingsToCompanies1709000000069';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS alert_settings jsonb
      DEFAULT '{"enabled":true,"recipients":[],"includeWhatsapp":false}'::jsonb
    `);

    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = '{"enabled":true,"recipients":[],"includeWhatsapp":false}'::jsonb
      WHERE alert_settings IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      DROP COLUMN IF EXISTS alert_settings
    `);
  }
}
