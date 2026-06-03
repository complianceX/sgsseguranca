import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLookaheadDaysToAlertSettings1709000000070 implements MigrationInterface {
  name = 'AddLookaheadDaysToAlertSettings1709000000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(
          alert_settings,
          '{"enabled":true,"recipients":[],"includeWhatsapp":false}'::jsonb
        ),
        '{lookaheadDays}',
        '30'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'lookaheadDays' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'lookaheadDays'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
