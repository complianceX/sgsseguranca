import { MigrationInterface, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

const SAFE_ROW_THRESHOLD = 50_000;

/**
 * Converts ai_interactions to a RANGE-partitioned table by created_at.
 *
 * Why partition this table specifically:
 *   ai_interactions has a 90-day TTL enforced by the retention worker
 *   (AI_HISTORY_MAX_DAYS=90). Without partitioning, retention is a row-by-row
 *   DELETE that produces large amounts of MVCC garbage and forces aggressive
 *   VACUUM. With partitioning, retention becomes DROP PARTITION — atomic,
 *   constant-time, no bloat.
 *
 * Safety guards (auto-skip the destructive path):
 *   1. Table missing → skip
 *   2. Table already partitioned → skip (idempotent re-run)
 *   3. Row count > 50.000 → skip with log + instructions for the manual
 *      playbook procedure (production)
 *
 * For dev/staging/new deploys (small or empty table), the conversion runs
 * in-transaction and takes <1s. For production with real history, the
 * migration deliberately does nothing — operators run the playbook during
 * a maintenance window.
 *
 * No FKs reference ai_interactions (verified before writing this migration),
 * so we don't need to drop/recreate cross-table constraints.
 *
 * transaction = true (default): the rename → create → copy → drop sequence
 * is atomic; on failure, the original table is restored.
 */
export class PartitionAiInteractions1709000000165
  implements MigrationInterface
{
  name = 'PartitionAiInteractions1709000000165';

  private readonly logger = new Logger('PartitionAiInteractions');

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      this.logger.log(
        'Tabela ai_interactions não existe; particionamento ignorado.',
      );
      return;
    }

    const partitionStatus = (await queryRunner.query(
      `SELECT relkind FROM pg_class WHERE relname = 'ai_interactions' AND relkind IN ('r', 'p')`,
    )) as Array<{ relkind: string }>;

    if (partitionStatus[0]?.relkind === 'p') {
      this.logger.log(
        'ai_interactions já é uma partitioned table; nada a fazer.',
      );
      return;
    }

    const countRes = (await queryRunner.query(
      `SELECT COUNT(*)::bigint AS c FROM ai_interactions`,
    )) as Array<{ c: string | number }>;
    const rowCount = Number(countRes[0]?.c ?? 0);

    if (rowCount > SAFE_ROW_THRESHOLD) {
      this.logger.warn(
        `[partition] ai_interactions tem ${rowCount} linhas (> ${SAFE_ROW_THRESHOLD}). ` +
          'Conversão automática abortada para evitar lock prolongado em produção. ' +
          'Execute o playbook manual em backend/docs/partitioning-playbook.md ' +
          'durante janela de manutenção.',
      );
      return;
    }

    this.logger.log(
      `[partition] Convertendo ai_interactions (${rowCount} linhas) para particionada por created_at.`,
    );

    // 1. Move the existing table aside.
    await queryRunner.query(
      `ALTER TABLE "ai_interactions" RENAME TO "ai_interactions_legacy"`,
    );

    // 2. Drop the policy + RLS on the legacy table; both will be recreated on
    //    the new partitioned table. Policies don't migrate via LIKE.
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "ai_interactions_legacy"`,
    );

    // 3. Build the partitioned parent. INCLUDING DEFAULTS preserves column
    //    defaults (e.g. gen_random_uuid()); INCLUDING IDENTITY preserves any
    //    SERIAL-style sequences. We deliberately DO NOT include constraints
    //    or indexes — partitioned tables require the partition key in the
    //    primary key, so we recreate it manually.
    await queryRunner.query(`
      CREATE TABLE "ai_interactions" (
        LIKE "ai_interactions_legacy" INCLUDING DEFAULTS INCLUDING IDENTITY
      ) PARTITION BY RANGE ("created_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_interactions"
      ADD CONSTRAINT "PK_ai_interactions" PRIMARY KEY ("id", "created_at")
    `);

    // 4. Recreate indexes (these become partitioned indexes and propagate to
    //    every partition automatically in PG 11+).
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_created"
      ON "ai_interactions" ("tenant_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_user_created"
      ON "ai_interactions" ("tenant_id", "user_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_id"
      ON "ai_interactions" ("tenant_id")
    `);

    // 5. Re-enable RLS + tenant isolation policy.
    await queryRunner.query(
      `ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "ai_interactions"
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);

    // 6. Default partition catches anything not falling into a monthly bucket.
    //    Without it, INSERT outside the configured ranges would error.
    await queryRunner.query(`
      CREATE TABLE "ai_interactions_default"
      PARTITION OF "ai_interactions" DEFAULT
    `);

    // 7. Pre-create monthly partitions for the rolling window the retention
    //    worker cares about: 3 months back through 3 months forward.
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
      const partitionName = `ai_interactions_${yyyy}_${mm}`;
      const startStr = `${yyyy}-${mm}-01`;
      const endYyyy = end.getUTCFullYear();
      const endMm = String(end.getUTCMonth() + 1).padStart(2, '0');
      const endStr = `${endYyyy}-${endMm}-01`;

      await queryRunner.query(`
        CREATE TABLE "${partitionName}"
        PARTITION OF "ai_interactions"
        FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `);
    }

    // 8. Copy data from the legacy table. With <50k rows this is a few
    //    hundred ms; the row count guard above is what makes this safe.
    await queryRunner.query(
      `INSERT INTO "ai_interactions" SELECT * FROM "ai_interactions_legacy"`,
    );

    // 9. Drop the legacy table. Atomicity of the surrounding transaction
    //    means a failure anywhere above leaves ai_interactions_legacy intact.
    await queryRunner.query(`DROP TABLE "ai_interactions_legacy"`);

    this.logger.log(
      `[partition] Conversão concluída. ${rowCount} linhas migradas para 7 partições mensais + default.`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      return;
    }

    const partitionStatus = (await queryRunner.query(
      `SELECT relkind FROM pg_class WHERE relname = 'ai_interactions'`,
    )) as Array<{ relkind: string }>;

    if (partitionStatus[0]?.relkind !== 'p') {
      this.logger.log('ai_interactions não está particionada; nada a reverter.');
      return;
    }

    // Reverse: copy data back into a flat table and replace the partitioned one.
    await queryRunner.query(
      `ALTER TABLE "ai_interactions" RENAME TO "ai_interactions_partitioned"`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_interactions" (
        LIKE "ai_interactions_partitioned" INCLUDING DEFAULTS INCLUDING IDENTITY
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_interactions"
      ADD CONSTRAINT "PK_ai_interactions" PRIMARY KEY ("id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_created"
      ON "ai_interactions" ("tenant_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_user"
      ON "ai_interactions" ("tenant_id", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_id"
      ON "ai_interactions" ("tenant_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "ai_interactions"
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);

    await queryRunner.query(
      `INSERT INTO "ai_interactions" SELECT * FROM "ai_interactions_partitioned"`,
    );

    // Dropping the partitioned parent cascades to all partition children.
    await queryRunner.query(
      `DROP TABLE "ai_interactions_partitioned" CASCADE`,
    );
  }
}
