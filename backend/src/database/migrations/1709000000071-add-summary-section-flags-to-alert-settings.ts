import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSummarySectionFlagsToAlertSettings1709000000071
  implements MigrationInterface
{
  name = 'AddSummarySectionFlagsToAlertSettings1709000000071';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(
              alert_settings,
              '{"enabled":true,"recipients":[],"includeWhatsapp":false,"lookaheadDays":30}'::jsonb
            ),
            '{includeComplianceSummary}',
            'true'::jsonb,
            true
          ),
          '{includeOperationsSummary}',
          'true'::jsonb,
          true
        ),
        '{includeOccurrencesSummary}',
        'true'::jsonb,
        true
      )
      WHERE alert_settings IS NULL
         OR alert_settings ? 'includeComplianceSummary' = false
         OR alert_settings ? 'includeOperationsSummary' = false
         OR alert_settings ? 'includeOccurrencesSummary' = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE companies
      SET alert_settings = (((COALESCE(alert_settings, '{}'::jsonb) - 'includeComplianceSummary') - 'includeOperationsSummary') - 'includeOccurrencesSummary')
      WHERE alert_settings IS NOT NULL
    `);
  }
}
