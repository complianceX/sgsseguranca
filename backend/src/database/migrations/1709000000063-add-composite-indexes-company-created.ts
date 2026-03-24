import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria 4 índices compostos (company_id, created_at) para otimizar queries
 * multi-tenant paginadas nas principais entidades do módulo SST.
 *
 * CREATE INDEX CONCURRENTLY não pode rodar dentro de uma transação.
 * Por isso esta migration define transaction = false.
 */
export class AddCompositeIndexesCompanyCreated1709000000063 implements MigrationInterface {
  name = 'AddCompositeIndexesCompanyCreated1709000000063';

  // Obrigatório para CREATE/DROP INDEX CONCURRENTLY (PostgreSQL não permite dentro de transação)
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_dds_company_created"
      ON "dds" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_pts_company_created"
      ON "pts" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_trainings_company_created"
      ON "trainings" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_medical_exams_company_created"
      ON "medical_exams" ("company_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_medical_exams_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_trainings_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_pts_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_dds_company_created"`,
    );
  }
}
