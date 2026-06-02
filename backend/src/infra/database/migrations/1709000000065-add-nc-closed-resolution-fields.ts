import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNcClosedResolutionFields1709000000065 implements MigrationInterface {
  name = 'AddNcClosedResolutionFields1709000000065';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      ADD COLUMN IF NOT EXISTS "resolved_by" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_nonconformities_resolved_by'
        ) THEN
          ALTER TABLE "nonconformities"
          ADD CONSTRAINT "FK_nonconformities_resolved_by"
          FOREIGN KEY ("resolved_by")
          REFERENCES "users"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      DROP CONSTRAINT IF EXISTS "FK_nonconformities_resolved_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      DROP COLUMN IF EXISTS "resolved_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      DROP COLUMN IF EXISTS "closed_at"
    `);
  }
}
