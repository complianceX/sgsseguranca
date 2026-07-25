import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona FKs críticas ausentes e normaliza colunas de `audit_logs`.
 *
 * REPRODUTIBILIDADE (corrigido após auditoria de banco)
 *   Esta migration falhava ao ser executada sobre um banco criado do zero
 *   (Disaster Recovery, novo ambiente), travando a cadeia de migrations:
 *
 *   1. `ALTER COLUMN ... TYPE uuid` era rejeitado pelo PostgreSQL quando a
 *      coluna participava de uma policy de RLS criada por migrations
 *      anteriores ("não é possível alterar o tipo de dados de coluna usada
 *      em uma definição de política"). As policies agora são preservadas:
 *      salvas, removidas durante o ALTER e recriadas exatamente como estavam.
 *
 *   2. `FK_notifications_user_id` era criada sem verificar compatibilidade de
 *      tipos — `notifications."userId"` é varchar e `users.id` é uuid, o que
 *      torna a constraint impossível ("chave estrangeira não pode ser
 *      implementada"). A coluna passa a ser convertida para uuid antes, e a
 *      FK só é criada quando a conversão é segura.
 *
 *   Além disso, a migration deixou de ser `transaction = false`: sem
 *   transação, uma falha no meio deixava o schema em estado parcial (renomes
 *   aplicados, FKs não). Agora é atômica — não usa comandos que exijam rodar
 *   fora de transação (não há CREATE/DROP INDEX CONCURRENTLY aqui).
 *
 *   Todas as etapas continuam idempotentes: aplicar sobre um banco que já
 *   passou pela versão anterior é no-op.
 */
export class FixCriticalMissingFks1709000000307 implements MigrationInterface {
  name = 'FixCriticalMissingFks1709000000307';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createPolicyPreservationHelper(queryRunner);
    await this.addDocumentImportsEmpresaIdFk(queryRunner);
    await this.fixAuditLogsColumnsAndAddFks(queryRunner);
    await this.addNotificationsUserIdFk(queryRunner);
    await this.addPushSubscriptionsUserIdFk(queryRunner);
    await this.dropPolicyPreservationHelper(queryRunner);
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

  /**
   * Executa `p_action` (SQL arbitrário) com as policies de `p_table`
   * temporariamente removidas, recriando-as exatamente como estavam.
   *
   * Necessário porque o PostgreSQL recusa `ALTER COLUMN ... TYPE` em colunas
   * referenciadas por policies de RLS. Helper temporário: é removido ao final
   * da migration para não deixar superfície extra no schema.
   */
  private async createPolicyPreservationHelper(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.__mig307_with_policies_dropped(
        p_table text,
        p_action text
      ) RETURNS void
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        pol record;
        recreate_stmts text[] := ARRAY[]::text[];
        stmt text;
      BEGIN
        FOR pol IN
          SELECT policyname, permissive, roles, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = p_table
        LOOP
          recreate_stmts := recreate_stmts || format(
            'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
            pol.policyname,
            p_table,
            CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            pol.cmd,
            array_to_string(pol.roles, ', '),
            CASE WHEN pol.qual       IS NOT NULL THEN ' USING (' || pol.qual || ')' ELSE '' END,
            CASE WHEN pol.with_check IS NOT NULL THEN ' WITH CHECK (' || pol.with_check || ')' ELSE '' END
          );
          EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, p_table);
        END LOOP;

        EXECUTE p_action;

        FOREACH stmt IN ARRAY recreate_stmts LOOP
          EXECUTE stmt;
        END LOOP;
      END;
      $fn$;
    `);
  }

  private async dropPolicyPreservationHelper(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.__mig307_with_policies_dropped(text, text);`,
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
          WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'userId'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE "audit_logs" RENAME COLUMN "userId" TO "user_id";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'companyId'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'company_id'
        ) THEN
          ALTER TABLE "audit_logs" RENAME COLUMN "companyId" TO "company_id";
        END IF;

        -- Conversões de tipo: só ocorrem com as policies de RLS temporariamente
        -- removidas, pois o PostgreSQL bloqueia ALTER TYPE em coluna usada por policy.
        -- Valores não convertíveis viram NULL (a coluna é opcional nas duas FKs,
        -- ambas ON DELETE SET NULL), evitando abortar a cadeia de migrations.
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
            AND column_name = 'user_id' AND data_type <> 'uuid'
        ) THEN
          PERFORM public.__mig307_with_policies_dropped(
            'audit_logs',
            'ALTER TABLE public.audit_logs ALTER COLUMN "user_id" TYPE uuid USING CASE WHEN "user_id"::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' THEN "user_id"::text::uuid ELSE NULL END'
          );
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
            AND column_name = 'company_id' AND data_type <> 'uuid'
        ) THEN
          PERFORM public.__mig307_with_policies_dropped(
            'audit_logs',
            'ALTER TABLE public.audit_logs ALTER COLUMN "company_id" TYPE uuid USING CASE WHEN "company_id"::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' THEN "company_id"::text::uuid ELSE NULL END'
          );
        END IF;

        -- FKs só são criadas quando os tipos já são compatíveis.
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_audit_logs_user_id' AND conrelid = 'public.audit_logs'::regclass
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
            AND column_name = 'user_id' AND data_type = 'uuid'
        ) THEN
          ALTER TABLE "audit_logs"
            ADD CONSTRAINT "FK_audit_logs_user_id"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_audit_logs_company_id' AND conrelid = 'public.audit_logs'::regclass
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
            AND column_name = 'company_id' AND data_type = 'uuid'
        ) THEN
          ALTER TABLE "audit_logs"
            ADD CONSTRAINT "FK_audit_logs_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  /**
   * `notifications."userId"` nasceu como varchar enquanto `users.id` é uuid.
   * A FK é impossível nesse estado, então a coluna é convertida antes.
   *
   * A conversão só acontece quando todos os valores presentes são UUIDs
   * válidos (ou nulos). Havendo lixo, a migration segue sem criar a FK em vez
   * de abortar o provisionamento inteiro — o dado inconsistente é tratado
   * separadamente, não durante o bootstrap do schema.
   */
  private async addNotificationsUserIdFk(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        invalid_count bigint := 0;
        col_type text;
      BEGIN
        IF to_regclass('public.notifications') IS NULL THEN
          RETURN;
        END IF;

        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'userId';

        IF col_type IS NULL THEN
          RETURN;
        END IF;

        IF col_type <> 'uuid' THEN
          EXECUTE $q$
            SELECT count(*) FROM public.notifications
            WHERE "userId" IS NOT NULL
              AND btrim("userId"::text) <> ''
              AND "userId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          $q$ INTO invalid_count;

          IF invalid_count > 0 THEN
            RAISE NOTICE 'FK_notifications_user_id ignorada: % valor(es) de "userId" não são UUID válido.', invalid_count;
            RETURN;
          END IF;

          PERFORM public.__mig307_with_policies_dropped(
            'notifications',
            'ALTER TABLE public.notifications ALTER COLUMN "userId" TYPE uuid USING NULLIF(btrim("userId"::text), '''')::uuid'
          );
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
        -- Só cria a FK quando o tipo já é compatível com users.id (uuid).
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
            AND column_name = 'userId' AND data_type = 'uuid'
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
