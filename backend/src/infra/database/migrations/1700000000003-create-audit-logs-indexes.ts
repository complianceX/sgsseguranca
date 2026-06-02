import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogsIndexes1700000000003 implements MigrationInterface {
  private async hasColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [tableName, columnName],
    )) as Array<{ '?column?': 1 }>;

    return result.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('audit_logs'))) {
      return;
    }

    // Índices simples para filtros comuns
    if (await this.hasColumn(queryRunner, 'audit_logs', 'userId')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_userId" ON "audit_logs" ("userId")`,
      );
    }

    if (await this.hasColumn(queryRunner, 'audit_logs', 'companyId')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_companyId" ON "audit_logs" ("companyId")`,
      );
    }

    if (await this.hasColumn(queryRunner, 'audit_logs', 'entity')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entity")`,
      );
    } else if (await this.hasColumn(queryRunner, 'audit_logs', 'entityType')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entityType")`,
      );
    }

    if (await this.hasColumn(queryRunner, 'audit_logs', 'entityId')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_entityId" ON "audit_logs" ("entityId")`,
      );
    }

    // Índices para ordenação temporal (muito usado em logs)
    if (await this.hasColumn(queryRunner, 'audit_logs', 'timestamp')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_timestamp" ON "audit_logs" ("timestamp" DESC)`,
      );
    }

    // Índices compostos para consultas frequentes (ex: ver logs de uma empresa ordenados por data)
    if (
      (await this.hasColumn(queryRunner, 'audit_logs', 'companyId')) &&
      (await this.hasColumn(queryRunner, 'audit_logs', 'timestamp'))
    ) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_audit_logs_company_timestamp" ON "audit_logs" ("companyId", "timestamp" DESC)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_logs_company_timestamp"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_timestamp"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_entityId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_companyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_userId"`);
  }
}
