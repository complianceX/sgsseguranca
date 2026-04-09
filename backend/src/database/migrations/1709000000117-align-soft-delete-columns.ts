import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignSoftDeleteColumns1709000000117
  implements MigrationInterface
{
  name = 'AlignSoftDeleteColumns1709000000117';
  transaction = false;

  private readonly targetTables = [
    'activities',
    'cats',
    'corrective_actions',
    'epis',
    'machines',
    'medical_exams',
    'reports',
    'risks',
    'service_orders',
    'sites',
    'tools',
    'trainings',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.targetTables) {
      if (!(await queryRunner.hasTable(table))) {
        continue;
      }

      if (await queryRunner.hasColumn(table, 'deleted_at')) {
        continue;
      }

      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "deleted_at" TIMESTAMPTZ`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.targetTables) {
      if (!(await queryRunner.hasTable(table))) {
        continue;
      }

      if (!(await queryRunner.hasColumn(table, 'deleted_at'))) {
        continue;
      }

      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "deleted_at"`,
      );
    }
  }
}
