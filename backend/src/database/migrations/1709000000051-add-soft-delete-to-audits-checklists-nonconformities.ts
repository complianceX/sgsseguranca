import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToAuditsChecklistsNonconformities1709000000051
  implements MigrationInterface
{
  name = 'AddSoftDeleteToAuditsChecklistsNonconformities1709000000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audits"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "checklists"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      DROP COLUMN IF EXISTS "deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "checklists"
      DROP COLUMN IF EXISTS "deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "audits"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
