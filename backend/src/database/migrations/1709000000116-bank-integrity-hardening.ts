import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankIntegrityHardening1709000000116 implements MigrationInterface {
  name = 'BankIntegrityHardening1709000000116';
  transaction = false;

  private async safeQuery(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('already exists') ||
        message.includes('permission denied') ||
        message.includes('must be owner')
      ) {
        return;
      }
      throw error;
    }
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [table, column],
    )) as Array<Record<string, unknown>>;

    return result.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // notifications: company_id obrigatório e derivado do usuário
    if (await queryRunner.hasTable('notifications')) {
      if (!(await this.hasColumn(queryRunner, 'notifications', 'company_id'))) {
        await queryRunner.query(
          `ALTER TABLE "notifications" ADD COLUMN "company_id" uuid`,
        );
      }

      await queryRunner.query(`
        UPDATE "notifications" n
        SET "company_id" = u."company_id"
        FROM "users" u
        WHERE n."userId" = u.id::text
          AND (n."company_id" IS NULL OR n."company_id" <> u."company_id")
      `);

      await queryRunner.query(`
        DELETE FROM "notifications"
        WHERE "company_id" IS NULL
      `);

      await queryRunner.query(`
        ALTER TABLE "notifications"
        ALTER COLUMN "company_id" SET NOT NULL
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'FK_notifications_company_id'
          ) THEN
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_notifications_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE;
          END IF;
        END $$;
      `);

      await this.safeQuery(
        queryRunner,
        `CREATE INDEX IF NOT EXISTS "IDX_notifications_company_created"
         ON "notifications" ("company_id", "createdAt" DESC)`,
      );

      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION sync_notifications_company_id()
        RETURNS TRIGGER AS $$
        BEGIN
          SELECT "company_id"
            INTO NEW."company_id"
          FROM "users"
          WHERE "id"::text = NEW."userId";

          IF NEW."company_id" IS NULL THEN
            RAISE EXCEPTION
              'notifications.company_id could not be resolved for user %',
              NEW."userId";
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trigger_notifications_sync_company_id"
        ON "notifications"
      `);

      await queryRunner.query(`
        CREATE TRIGGER "trigger_notifications_sync_company_id"
        BEFORE INSERT OR UPDATE ON "notifications"
        FOR EACH ROW
        EXECUTE FUNCTION sync_notifications_company_id();
      `);
    }

    // signatures: company_id obrigatório, FK rígida e index por documento
    if (await queryRunner.hasTable('signatures')) {
      if (!(await this.hasColumn(queryRunner, 'signatures', 'company_id'))) {
        await queryRunner.query(
          `ALTER TABLE "signatures" ADD COLUMN "company_id" uuid`,
        );
      }

      await queryRunner.query(`
        UPDATE "signatures" s
        SET "company_id" = u."company_id"
        FROM "users" u
        WHERE s."user_id" = u.id
          AND (s."company_id" IS NULL OR s."company_id" <> u."company_id")
      `);

      await queryRunner.query(`
        ALTER TABLE "signatures"
        ALTER COLUMN "company_id" SET NOT NULL
      `);

      await queryRunner.query(`
        ALTER TABLE "signatures"
        DROP CONSTRAINT IF EXISTS "FK_signatures_company_id"
      `);

      await queryRunner.query(`
        ALTER TABLE "signatures"
        ADD CONSTRAINT "FK_signatures_company_id"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT
      `);

      await this.safeQuery(
        queryRunner,
        `CREATE INDEX IF NOT EXISTS "IDX_signatures_document_type_document_id"
         ON "signatures" ("document_type", "document_id")`,
      );

      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION sync_signatures_company_id()
        RETURNS TRIGGER AS $$
        BEGIN
          SELECT "company_id"
            INTO NEW."company_id"
          FROM "users"
          WHERE "id" = NEW."user_id";

          IF NEW."company_id" IS NULL THEN
            RAISE EXCEPTION
              'signatures.company_id could not be resolved for user %',
              NEW."user_id";
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trigger_signatures_sync_company_id"
        ON "signatures"
      `);

      await queryRunner.query(`
        CREATE TRIGGER "trigger_signatures_sync_company_id"
        BEFORE INSERT OR UPDATE ON "signatures"
        FOR EACH ROW
        EXECUTE FUNCTION sync_signatures_company_id();
      `);
    }

    // Índices de consulta quentes restantes do relatório
    if (
      (await queryRunner.hasTable('user_sessions')) &&
      (await this.hasColumn(queryRunner, 'user_sessions', 'user_id')) &&
      (await this.hasColumn(queryRunner, 'user_sessions', 'is_active')) &&
      (await this.hasColumn(queryRunner, 'user_sessions', 'expires_at'))
    ) {
      await this.safeQuery(
        queryRunner,
        `CREATE INDEX IF NOT EXISTS "IDX_user_sessions_user_active_expires"
         ON "user_sessions" ("user_id", "is_active", "expires_at")`,
      );
    }

    await this.safeQuery(
      queryRunner,
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_company_entity_entityId"
       ON "audit_logs" ("companyId", "entity", "entityId")`,
    );

    await this.safeQuery(
      queryRunner,
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_company_id"
       ON "contracts" ("company_id")`,
    );

    // Soft delete regulatório sem mexer nos services:
    // DELETE passa a virar marcação de deleted_at no banco.
    for (const table of ['trainings', 'medical_exams', 'corrective_actions']) {
      if (await queryRunner.hasTable(table)) {
        if (!(await this.hasColumn(queryRunner, table, 'deleted_at'))) {
          await queryRunner.query(
            `ALTER TABLE "${table}" ADD COLUMN "deleted_at" TIMESTAMPTZ`,
          );
        }

        await queryRunner.query(`
          CREATE OR REPLACE FUNCTION soft_delete_preserve_row()
          RETURNS TRIGGER AS $$
          BEGIN
            EXECUTE format(
              'UPDATE %I SET deleted_at = NOW() WHERE id = $1',
              TG_TABLE_NAME
            ) USING OLD.id;
            RETURN NULL;
          END;
          $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(
          `DROP TRIGGER IF EXISTS "trigger_${table}_soft_delete" ON "${table}"`,
        );

        await queryRunner.query(`
          CREATE TRIGGER "trigger_${table}_soft_delete"
          BEFORE DELETE ON "${table}"
          FOR EACH ROW
          EXECUTE FUNCTION soft_delete_preserve_row();
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['trainings', 'medical_exams', 'corrective_actions']) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.query(
          `DROP TRIGGER IF EXISTS "trigger_${table}_soft_delete" ON "${table}"`,
        );
      }
    }
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS soft_delete_preserve_row()`,
    );

    if (await queryRunner.hasTable('contracts')) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_contracts_company_id"`,
      );
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_company_entity_entityId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_sessions_user_active_expires"`,
    );

    if (await queryRunner.hasTable('signatures')) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "trigger_signatures_sync_company_id" ON "signatures"`,
      );
      await queryRunner.query(
        `DROP FUNCTION IF EXISTS sync_signatures_company_id()`,
      );
      await queryRunner.query(
        `ALTER TABLE "signatures" DROP CONSTRAINT IF EXISTS "FK_signatures_company_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_signatures_document_type_document_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "signatures" ALTER COLUMN "company_id" DROP NOT NULL`,
      );
    }

    if (await queryRunner.hasTable('notifications')) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "trigger_notifications_sync_company_id" ON "notifications"`,
      );
      await queryRunner.query(
        `DROP FUNCTION IF EXISTS sync_notifications_company_id()`,
      );
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_company_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_notifications_company_created"`,
      );
      await queryRunner.query(
        `ALTER TABLE "notifications" ALTER COLUMN "company_id" DROP NOT NULL`,
      );
    }
  }
}
