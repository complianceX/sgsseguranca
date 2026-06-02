import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersIndexes1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    // Índices simples
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_cpf" ON "users" ("cpf")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_company_id" ON "users" ("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_profile_id" ON "users" ("profile_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_site_id" ON "users" ("site_id")`,
    );

    // Índices compostos
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_company_status" ON "users" ("company_id", "status")`,
    );

    // Índices parciais (apenas usuários ativos)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_active_users" ON "users" ("id") WHERE "status" = true`,
    );

    // Índices full-text search para nome
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_nome_fulltext" ON "users" USING gin(to_tsvector('portuguese', "nome"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_nome_fulltext"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_active_users"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_company_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_profile_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_cpf"`);
  }
}
