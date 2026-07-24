import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A trigger `sync_notifications_company_id()` resolvia o company_id da
 * notificação a partir do usuário com `WHERE "id"::text = NEW."userId"`.
 *
 * O cast `::text` foi escrito quando `notifications."userId"` ainda era varchar.
 * Depois a coluna passou a ser uuid, e a comparação virou `text = uuid` — um
 * operador que não existe no PostgreSQL. A partir daí, TODO insert em
 * `notifications` passou a falhar com:
 *   `operator does not exist: text = uuid`
 *
 * O defeito ficava invisível porque os chamadores (ex.: fila operacional do
 * dashboard) envolvem a criação da notificação em try/catch e apenas logam um
 * WARN. Resultado prático: as notificações operacionais nunca eram gravadas.
 *
 * Correção: comparar uuid com uuid, sem cast — `WHERE "id" = NEW."userId"`.
 * Mantém `SET search_path = public` do hardening da migration 1709000000311.
 */
export class FixSyncNotificationsCompanyIdUuidCompare1709000000357 implements MigrationInterface {
  name = 'FixSyncNotificationsCompanyIdUuidCompare1709000000357';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_notifications_company_id()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        SELECT "company_id"
          INTO NEW."company_id"
        FROM "users"
        WHERE "id" = NEW."userId";

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'notifications.company_id could not be resolved for user %',
            NEW."userId";
        END IF;

        RETURN NEW;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverte para a versão anterior (com o cast quebrado) para preservar
    // a reversibilidade estrita da migration.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_notifications_company_id()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
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
      $$;
    `);
  }
}
