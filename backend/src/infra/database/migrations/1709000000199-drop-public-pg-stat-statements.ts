import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPublicPgStatStatements1709000000199 implements MigrationInterface {
  name = 'DropPublicPgStatStatements1709000000199';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_stat_statements`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`,
    );
  }
}
