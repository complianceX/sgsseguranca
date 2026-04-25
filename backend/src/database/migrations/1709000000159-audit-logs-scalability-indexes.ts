import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices de escalabilidade para audit_logs.
 *
 * audit_logs cresce ~1M+ linhas/empresa/ano e não tinha índice cobrindo
 * as queries mais frequentes:
 *  - dashboard/relatório por empresa e período
 *  - histórico por usuário e período
 *
 * transaction = false: CONCURRENTLY não é permitido dentro de bloco de transação.
 */
export class AuditLogsScalabilityIndexes1709000000159
  implements MigrationInterface
{
  name = 'AuditLogsScalabilityIndexes1709000000159';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('audit_logs'))) {
      return;
    }

    // Cobertura de queries: WHERE companyId = ? ORDER BY timestamp DESC
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_company_timestamp"
      ON "audit_logs" ("companyId", "timestamp" DESC)
    `);

    // Cobertura de queries: WHERE userId = ? ORDER BY timestamp DESC (histórico de usuário)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_user_timestamp"
      ON "audit_logs" ("userId", "timestamp" DESC)
    `);

    // Cobertura de queries: WHERE companyId = ? AND entity = ? AND entityId = ?
    // (já existe como index de entity no AuditLog ORM mas garantimos aqui)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_company_entity_ts"
      ON "audit_logs" ("companyId", "entity", "timestamp" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_company_entity_ts"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_user_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_company_timestamp"`,
    );
  }
}
