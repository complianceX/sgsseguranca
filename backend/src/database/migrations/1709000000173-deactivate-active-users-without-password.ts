import { MigrationInterface, QueryRunner } from 'typeorm';

const USER_IDS_WITHOUT_PASSWORD = [
  '7aad2f9a-16f8-414b-94a7-8f933ccec12f',
  'ce373d02-b0c5-486a-bb7f-c1f1b3cb835f',
  'bd8eb5d8-9e1b-482b-a922-e7689da27096',
  '39da2f17-b1ea-4378-8303-1de999099f1d',
  '2d4172ad-a0c3-4a35-bdc3-53cc530d10cb',
  'c48de427-ead9-422d-8cf8-9055cf94dc35',
  '063a7160-bfb7-45ee-a796-7b3a51d2d9ac',
] as const;

export class DeactivateActiveUsersWithoutPassword1709000000173
  implements MigrationInterface
{
  name = 'DeactivateActiveUsersWithoutPassword1709000000173';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE "users"
      SET "status" = false,
          "updated_at" = NOW()
      WHERE "id" = ANY($1::uuid[])
        AND "status" = true
        AND ("password" IS NULL OR btrim("password") = '')
      `,
      [USER_IDS_WITHOUT_PASSWORD],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE "users"
      SET "status" = true,
          "updated_at" = NOW()
      WHERE "id" = ANY($1::uuid[])
        AND "status" = false
        AND ("password" IS NULL OR btrim("password") = '')
      `,
      [USER_IDS_WITHOUT_PASSWORD],
    );
  }
}
