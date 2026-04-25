import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice de escalabilidade para o inbox de notificações por usuário.
 *
 * A query mais frequente é: WHERE "userId" = ? AND "read" = false ORDER BY "createdAt" DESC
 * Sem este índice, cada carregamento de inbox faz full scan em notifications
 * (potencialmente 100k+ linhas/empresa em produção).
 *
 * IDX_notifications_company_created já existe (migration 116) — cobre queries por empresa.
 * Este índice cobre a perspectiva do usuário individual (inbox).
 *
 * transaction = false: CONCURRENTLY exige autocommit.
 */
export class NotificationsInboxIndex1709000000160 implements MigrationInterface {
  name = 'NotificationsInboxIndex1709000000160';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_user_read_created"
      ON "notifications" ("userId", "read", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_notifications_user_read_created"`,
    );
  }
}
