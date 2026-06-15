import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class AddSoftDeleteNotificationsPush1709000000201 implements MigrationInterface {
  name = 'AddSoftDeleteNotificationsPush1709000000201';
  // CREATE/DROP INDEX CONCURRENTLY não pode rodar dentro de transação
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      await this.upSqlite(queryRunner);
      return;
    }
    await this.upPostgres(queryRunner);
  }

  private async upSqlite(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['notifications', 'push_subscriptions']) {
      if (!(await queryRunner.hasTable(table))) continue;
      const cols = (await queryRunner.query(
        `PRAGMA table_info(${table})`,
      )) as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'deleted_at')) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD COLUMN "deleted_at" DATETIME NULL`,
        );
      }
    }
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar deleted_at em notifications
    if (await queryRunner.hasTable('notifications')) {
      const hasDeleted = await this.hasColumn(
        queryRunner,
        'notifications',
        'deleted_at',
      );
      if (!hasDeleted) {
        await queryRunner.query(
          `ALTER TABLE "notifications" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
        );
      }

      // 2. Recriar RLS policy incluindo deleted_at IS NULL no USING (SELECT/UPDATE/DELETE)
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_notifications_company_isolation" ON "notifications"`,
      );
      await queryRunner.query(`
        CREATE POLICY "rls_notifications_company_isolation"
        ON "notifications"
        AS RESTRICTIVE
        FOR ALL
        USING (
          (company_id = current_company() OR is_super_admin() = true)
          AND (deleted_at IS NULL OR is_super_admin() = true)
        )
        WITH CHECK (company_id = current_company() OR is_super_admin() = true)
      `);
    }

    // 3. Adicionar deleted_at em push_subscriptions
    if (await queryRunner.hasTable('push_subscriptions')) {
      const hasDeleted = await this.hasColumn(
        queryRunner,
        'push_subscriptions',
        'deleted_at',
      );
      if (!hasDeleted) {
        await queryRunner.query(
          `ALTER TABLE "push_subscriptions" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
        );
      }

      // 4. Índice parcial em push_subscriptions para queries de subscrições ativas
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_push_subscriptions_active"
        ON "push_subscriptions" ("userId", "tenantId")
        WHERE deleted_at IS NULL
      `);
    }
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
      [table, column],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

    if (await queryRunner.hasTable('push_subscriptions')) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "IDX_push_subscriptions_active"`,
      );
      await queryRunner.query(
        `ALTER TABLE "push_subscriptions" DROP COLUMN IF EXISTS "deleted_at"`,
      );
    }

    if (await queryRunner.hasTable('notifications')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_notifications_company_isolation" ON "notifications"`,
      );
      await queryRunner.query(`
        CREATE POLICY "rls_notifications_company_isolation"
        ON "notifications"
        AS RESTRICTIVE
        FOR ALL
        USING (company_id = current_company() OR is_super_admin() = true)
        WITH CHECK (company_id = current_company() OR is_super_admin() = true)
      `);
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "deleted_at"`,
      );
    }
  }
}
