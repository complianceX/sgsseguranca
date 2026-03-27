import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectPrefixToAlertSettings1709000000074
  implements MigrationInterface
{
  name = 'AddSubjectPrefixToAlertSettings1709000000074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        COALESCE(alert_settings, '{}'::jsonb),
        '{subjectPrefix}',
        'null'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'subjectPrefix' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = COALESCE(alert_settings, '{}'::jsonb) - 'subjectPrefix'
      WHERE alert_settings IS NOT NULL
    `);
  }
}
