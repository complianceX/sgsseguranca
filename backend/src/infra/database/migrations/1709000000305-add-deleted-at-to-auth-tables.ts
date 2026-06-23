import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToAuthTables1709000000305 implements MigrationInterface {
  name = 'AddDeletedAtToAuthTables1709000000305';

  // CREATE INDEX CONCURRENTLY exige migration fora de transacao.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona deleted_at nas tabelas de autenticacao com company_id.
    // Permite que deleteCompanyData as descubra via information_schema e as inclua
    // no soft-delete automatico ao remover uma empresa (LGPD offboarding).
    await queryRunner.query(`
      ALTER TABLE "user_mfa_credentials"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_mfa_recovery_codes"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sessions"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_mfa_credentials_deleted_at"
      ON "user_mfa_credentials" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_mfa_recovery_codes_deleted_at"
      ON "user_mfa_recovery_codes" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_sessions_deleted_at"
      ON "user_sessions" ("deleted_at")
      WHERE "deleted_at" IS NOT NULL
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_user_sessions_deleted_at"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_user_mfa_recovery_codes_deleted_at"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_user_mfa_credentials_deleted_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_sessions" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_mfa_recovery_codes" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_mfa_credentials" DROP COLUMN IF EXISTS "deleted_at"`,
    );
  }

  private async executeBestEffort(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error) {
      if (this.isOwnershipError(error)) {
        return;
      }
      throw error;
    }
  }

  private isOwnershipError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /must be owner of table/i.test(message) ||
      /must be owner of relation/i.test(message) ||
      /must be owner of index/i.test(message)
    );
  }
}
