import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCadenceDaysToAlertSettings1709000000076
  implements MigrationInterface
{
  name = 'AddCadenceDaysToAlertSettings1709000000076';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(alert_settings, '{}'::jsonb),
        '{cadenceDays}',
        '1'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'cadenceDays' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'cadenceDays'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
