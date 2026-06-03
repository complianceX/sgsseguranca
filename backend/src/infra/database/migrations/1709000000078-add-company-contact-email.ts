import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyContactEmail1709000000078 implements MigrationInterface {
  name = 'AddCompanyContactEmail1709000000078';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS email_contato text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      DROP COLUMN IF EXISTS email_contato
    `);
  }
}
