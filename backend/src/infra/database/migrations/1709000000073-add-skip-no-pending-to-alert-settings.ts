import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkipNoPendingToAlertSettings1709000000073 implements MigrationInterface {
  name = 'AddSkipNoPendingToAlertSettings1709000000073';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(alert_settings, '{}'::jsonb),
        '{skipWhenNoPending}',
        'false'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'skipWhenNoPending' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'skipWhenNoPending'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
