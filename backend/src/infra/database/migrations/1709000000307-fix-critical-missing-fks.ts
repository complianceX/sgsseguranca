import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCriticalMissingFks1709000000307 implements MigrationInterface {
  name = 'FixCriticalMissingFks1709000000307';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addDocumentImportsEmpresaIdFk(queryRunner);
    await this.fixAuditLogsColumnsAndAddFks(queryRunner);
    await this.addNotificationsUserIdFk(queryRunner);
    await this.addPushSubscriptionsUserIdFk(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_push_subscriptions_user_id' AND conrelid = 'public.push_subscriptions'::regclass) THEN
          ALTER TABLE "push_subscriptions" DROP CONSTRAINT "FK_push_subscriptions_user_id";
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_notifications_user_id' AND conrelid = 'public.notifications'::regclass) THEN
          ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user_id";
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_audit_logs_user_id' AND conrelid = 'public.audit_logs'::regclass) THEN
          ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_user_id";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_audit_logs_company_id' AND conrelid = 'public.audit_logs'::regclass) THEN
          ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_company_id";
        END IF;
        IF to_regclass('public.audit_logs') IS NOT NULL THEN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'user_id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'userId') THEN
            ALTER TABLE "audit_logs" RENAME COLUMN "user_id" TO "userId";
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'company_id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'companyId') THEN
            ALTER TABLE "audit_logs" RENAME COLUMN "company_id" TO "companyId";
          END IF;
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_document_imports_empresa_id' AND conrelid = 'public.document_imports'::regclass) THEN
          ALTER TABLE "document_imports" DROP CONSTRAINT "FK_document_imports_empresa_id";
        END IF;
      END $$;`,
    );
  }

  private async addDocumentImportsEmpresaIdFk(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('public.document_imports') IS NULL THEN
          RETURN;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_document_imports_empresa_id'
            AND conrelid = 'public.document_imports'::regclass
        ) THEN
          ALTER TABLE "document_imports"
            ADD CONSTRAINT "FK_document_imports_empresa_id"
            FOREIGN KEY ("empresa_id") REFERENCES "companies"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  private async fixAuditLogsColumnsAndAddFks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('public.audit_logs') IS NULL THEN
          RETURN;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'userId'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'user_id'
        ) THEN
          ALTER TABLE "audit_logs" RENAME COLUMN "userId" TO "user_id";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'companyId'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'company_id'
        ) THEN
          ALTER TABLE "audit_logs" RENAME COLUMN "companyId" TO "company_id";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'user_id'
            AND data_type != 'uuid'
        ) THEN
          ALTER TABLE "audit_logs" ALTER COLUMN "user_id" TYPE uuid USING "user_id"::uuid;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_logs'
            AND column_name = 'company_id'
            AND data_type != 'uuid'
        ) THEN
          ALTER TABLE "audit_logs" ALTER COLUMN "company_id" TYPE uuid USING "company_id"::uuid;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_audit_logs_user_id'
            AND conrelid = 'public.audit_logs'::regclass
        ) THEN
          ALTER TABLE "audit_logs"
            ADD CONSTRAINT "FK_audit_logs_user_id"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_audit_logs_company_id'
            AND conrelid = 'public.audit_logs'::regclass
        ) THEN
          ALTER TABLE "audit_logs"
            ADD CONSTRAINT "FK_audit_logs_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  private async addNotificationsUserIdFk(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('public.notifications') IS NULL THEN
          RETURN;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notifications'
            AND column_name = 'userId'
        ) THEN
          RETURN;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_notifications_user_id'
            AND conrelid = 'public.notifications'::regclass
        ) THEN
          ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_notifications_user_id"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  private async addPushSubscriptionsUserIdFk(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('public.push_subscriptions') IS NULL THEN
          RETURN;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'push_subscriptions'
            AND column_name = 'userId'
        ) THEN
          RETURN;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_push_subscriptions_user_id'
            AND conrelid = 'public.push_subscriptions'::regclass
        ) THEN
          ALTER TABLE "push_subscriptions"
            ADD CONSTRAINT "FK_push_subscriptions_user_id"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }
}
