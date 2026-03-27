import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleFieldsToAlertSettings1709000000072
  implements MigrationInterface
{
  name = 'AddScheduleFieldsToAlertSettings1709000000072';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(alert_settings, '{}'::jsonb),
            '{deliveryHour}',
            '8'::jsonb,
            true
          ),
          '{weekdaysOnly}',
          'true'::jsonb,
          true
        ),
        '{lastScheduledDispatchAt}',
        'null'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'deliveryHour' = false
         OR alert_settings ? 'weekdaysOnly' = false
         OR alert_settings ? 'lastScheduledDispatchAt' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = ((((COALESCE(alert_settings, '{}'::jsonb) - 'deliveryHour') - 'weekdaysOnly') - 'lastScheduledDispatchAt'))
      WHERE alert_settings IS NOT NULL
    `);
  }
}
