import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSnoozeUntilToAlertSettings1709000000077 implements MigrationInterface {
  name = 'AddSnoozeUntilToAlertSettings1709000000077';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(alert_settings, '{}'::jsonb),
        '{snoozeUntil}',
        'null'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'snoozeUntil' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'snoozeUntil'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
