import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompaniesIndexes1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('companies'))) {
      return;
    }

    // Índices simples
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_companies_cnpj" ON "companies" ("cnpj")`,
    );

    // Índices full-text search para razao_social
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_companies_razao_social_fulltext" ON "companies" USING gin(to_tsvector('portuguese', "razao_social"))`,
    );

    // Índices parciais (apenas empresas ativas)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_active_companies" ON "companies" ("id") WHERE "status" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_active_companies"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_companies_razao_social_fulltext"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_companies_cnpj"`);
  }
}
