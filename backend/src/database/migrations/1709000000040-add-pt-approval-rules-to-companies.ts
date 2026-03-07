import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtApprovalRulesToCompanies1709000000040
  implements MigrationInterface
{
  name = 'AddPtApprovalRulesToCompanies1709000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS pt_approval_rules jsonb
      DEFAULT '{"blockCriticalRiskWithoutEvidence":true,"blockWorkerWithoutValidMedicalExam":true,"blockWorkerWithExpiredBlockingTraining":true,"requireAtLeastOneExecutante":false}'::jsonb
    `);

    await queryRunner.query(`
      UPDATE companies
      SET pt_approval_rules = '{"blockCriticalRiskWithoutEvidence":true,"blockWorkerWithoutValidMedicalExam":true,"blockWorkerWithExpiredBlockingTraining":true,"requireAtLeastOneExecutante":false}'::jsonb
      WHERE pt_approval_rules IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      DROP COLUMN IF EXISTS pt_approval_rules
    `);
  }
}
