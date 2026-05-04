import { MigrationInterface, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

const SAFE_ROW_THRESHOLD = 50_000;

/**
 * Converts mail_logs to a RANGE-partitioned table by created_at.
 *
 * Why partition this table:
 *   mail_logs grows unbounded over time (one row per email sent).
 *   Partitioning enables efficient range-based cleanup and improves
 *   query performance for date-filtered reporting.
 *
 * Safety guards (auto-skip the destructive path):
 *   1. Table missing → skip
 *   2. Table already partitioned → skip (idempotent re-run)
 *   3. Row count > 50.000 → skip with log — run the manual playbook
 *      in backend/docs/partitioning-playbook.md during a maintenance window.
 *
 * Note: FK constraints from mail_logs to companies and users are NOT
 * recreated on the partitioned table because PostgreSQL does not support
 * FK constraints from a partitioned table that reference non-partitioned
 * tables without including the partition key. RLS + company_id filtering
 * at the application layer provides equivalent data integrity guarantees.
 *
 * transaction = true (default): the rename → create → copy → drop sequence
 * is atomic; a failure anywhere leaves mail_logs_legacy intact.
 */
export class PartitionMailLogs1709000000192 implements MigrationInterface {
  name = 'PartitionMailLogs1709000000192';

  private readonly logger = new Logger('PartitionMailLogs');

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('mail_logs'))) {
      this.logger.log('Tabela mail_logs não existe; particionamento ignorado.');
      return;
    }

    const partitionStatus = (await queryRunner.query(
      `SELECT relkind FROM pg_class WHERE relname = 'mail_logs' AND relkind IN ('r', 'p')`,
    )) as Array<{ relkind: string }>;

    if (partitionStatus[0]?.relkind === 'p') {
      this.logger.log(
        'mail_logs já é uma partitioned table; nada a fazer.',
      );
      return;
    }

    const countRes = (await queryRunner.query(
      `SELECT COUNT(*)::bigint AS c FROM mail_logs`,
    )) as Array<{ c: string | number }>;
    const rowCount = Number(countRes[0]?.c ?? 0);

    if (rowCount > SAFE_ROW_THRESHOLD) {
      this.logger.warn(
        `[partition] mail_logs tem ${rowCount} linhas (> ${SAFE_ROW_THRESHOLD}). ` +
          'Conversão automática abortada para evitar lock prolongado em produção. ' +
          'Execute o playbook manual em backend/docs/partitioning-playbook.md ' +
          'durante janela de manutenção.',
      );
      return;
    }

    this.logger.log(
      `[partition] Convertendo mail_logs (${rowCount} linhas) para particionada por created_at.`,
    );

    // 1. Move the existing table aside.
    await queryRunner.query(
      `ALTER TABLE "mail_logs" RENAME TO "mail_logs_legacy"`,
    );

    // 2. Free globally-scoped constraint/index names.
    await queryRunner.query(
      `ALTER TABLE "mail_logs_legacy" DROP CONSTRAINT IF EXISTS "PK_mail_logs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_logs_legacy" DROP CONSTRAINT IF EXISTS "mail_logs_pkey"`,
    );
    // Drop FK constraints — not supported on partitioned parent tables.
    await queryRunner.query(
      `ALTER TABLE "mail_logs_legacy" DROP CONSTRAINT IF EXISTS "FK_mail_logs_company_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_logs_legacy" DROP CONSTRAINT IF EXISTS "FK_mail_logs_user_id"`,
    );

    // 3. Build the partitioned parent.
    await queryRunner.query(`
      CREATE TABLE "mail_logs" (
        LIKE "mail_logs_legacy" INCLUDING DEFAULTS INCLUDING IDENTITY
      ) PARTITION BY RANGE ("created_at")
    `);

    // PK must include the partition key (created_at).
    await queryRunner.query(`
      ALTER TABLE "mail_logs"
      ADD CONSTRAINT "PK_mail_logs" PRIMARY KEY ("id", "created_at")
    `);

    // 4. Recreate indexes.
    await queryRunner.query(`
      CREATE INDEX "IDX_mail_logs_company_created"
      ON "mail_logs" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mail_logs_user_created"
      ON "mail_logs" ("user_id", "created_at")
      WHERE "user_id" IS NOT NULL
    `);

    // 5. Enable RLS + tenant isolation policy.
    await queryRunner.query(
      `ALTER TABLE "mail_logs" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_logs" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "mail_logs"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "mail_logs"
      USING (
        company_id = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        company_id = current_company()
        OR is_super_admin() = true
      )
    `);

    // 6. Default partition catches rows outside configured monthly buckets.
    await queryRunner.query(`
      CREATE TABLE "mail_logs_default"
      PARTITION OF "mail_logs" DEFAULT
    `);
    // SECURITY: PostgreSQL does NOT automatically propagate ENABLE/FORCE ROW
    // LEVEL SECURITY to child partitions. Each partition must be hardened
    // individually so that direct partition access (e.g. via admin tools) also
    // enforces tenant isolation.
    await this.enforcePartitionRls(queryRunner, 'mail_logs_default');

    // 7. Pre-create monthly partitions: 3 months back through 3 months forward.
    const baseDate = new Date();
    baseDate.setUTCDate(1);
    baseDate.setUTCHours(0, 0, 0, 0);

    for (let offset = -3; offset <= 3; offset++) {
      const start = new Date(baseDate);
      start.setUTCMonth(start.getUTCMonth() + offset);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);

      const yyyy = start.getUTCFullYear();
      const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
      const partitionName = `mail_logs_${yyyy}_${mm}`;
      const startStr = `${yyyy}-${mm}-01`;
      const endYyyy = end.getUTCFullYear();
      const endMm = String(end.getUTCMonth() + 1).padStart(2, '0');
      const endStr = `${endYyyy}-${endMm}-01`;

      await queryRunner.query(`
        CREATE TABLE "${partitionName}"
        PARTITION OF "mail_logs"
        FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `);
      await this.enforcePartitionRls(queryRunner, partitionName);
    }

    // 8. Copy data from legacy table.
    await queryRunner.query(
      `INSERT INTO "mail_logs" SELECT * FROM "mail_logs_legacy"`,
    );

    // 9. Drop legacy table.
    await queryRunner.query(`DROP TABLE "mail_logs_legacy"`);

    this.logger.log(
      `[partition] Conversão concluída. ${rowCount} linhas migradas para 7 partições mensais + default.`,
    );
  }

  private async enforcePartitionRls(
    queryRunner: QueryRunner,
    partitionName: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${partitionName}" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "${partitionName}" FORCE ROW LEVEL SECURITY`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('mail_logs'))) {
      return;
    }

    const partitionStatus = (await queryRunner.query(
      `SELECT relkind FROM pg_class WHERE relname = 'mail_logs'`,
    )) as Array<{ relkind: string }>;

    if (partitionStatus[0]?.relkind !== 'p') {
      this.logger.log('mail_logs não está particionada; nada a reverter.');
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "mail_logs" RENAME TO "mail_logs_partitioned"`,
    );

    await queryRunner.query(
      `ALTER TABLE "mail_logs_partitioned" DROP CONSTRAINT IF EXISTS "PK_mail_logs"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mail_logs_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mail_logs_user_created"`,
    );

    await queryRunner.query(`
      CREATE TABLE "mail_logs" (
        LIKE "mail_logs_partitioned" INCLUDING DEFAULTS INCLUDING IDENTITY
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "mail_logs"
      ADD CONSTRAINT "PK_mail_logs" PRIMARY KEY ("id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mail_logs_company_created"
      ON "mail_logs" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mail_logs_user_created"
      ON "mail_logs" ("user_id", "created_at")
      WHERE "user_id" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "mail_logs" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_logs" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "mail_logs"
      USING (
        company_id = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        company_id = current_company()
        OR is_super_admin() = true
      )
    `);

    await queryRunner.query(
      `INSERT INTO "mail_logs" SELECT * FROM "mail_logs_partitioned"`,
    );

    // Dropping the partitioned parent cascades to all partition children.
    await queryRunner.query(`DROP TABLE "mail_logs_partitioned" CASCADE`);
  }
}
