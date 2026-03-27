import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMinPendingThresholdToAlertSettings1709000000075
  implements MigrationInterface
{
  name = 'AddMinPendingThresholdToAlertSettings1709000000075';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(alert_settings, '{}'::jsonb),
        '{minimumPendingItems}',
        '0'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'minimumPendingItems' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'minimumPendingItems'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
