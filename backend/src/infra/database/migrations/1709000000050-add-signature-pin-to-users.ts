import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignaturePinToUsers1709000000050 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS signature_pin_hash  VARCHAR,
        ADD COLUMN IF NOT EXISTS signature_pin_salt  VARCHAR;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS signature_pin_hash,
        DROP COLUMN IF EXISTS signature_pin_salt;
    `);
  }
}
