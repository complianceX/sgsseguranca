import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class HardenNotificationsUseridFk1709000000200 implements MigrationInterface {
  name = 'HardenNotificationsUseridFk1709000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    if (isSqlite(queryRunner)) {
      return;
    }

    // 1. Garantir que company_id existe
    const cols = (await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'company_id'
    `)) as Array<{ column_name: string }>;

    if (cols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "notifications" ADD COLUMN "company_id" uuid`,
      );
    }

    // 2. Verificar se userId já é uuid
    const userIdCol = (await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'userId'
    `)) as Array<{ data_type: string }>;

    if (userIdCol.length > 0 && userIdCol[0].data_type !== 'uuid') {
      // Remover notificações com userId inválido antes do cast
      await queryRunner.query(`
        DELETE FROM "notifications"
        WHERE "userId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `);

      await queryRunner.query(`
        ALTER TABLE "notifications"
        ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid
      `);
    }

    // 3. FK para users.id (se não existir)
    const fkUser = (await queryRunner.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND constraint_name = 'FK_notifications_user'
    `)) as Array<{ constraint_name: string }>;

    if (fkUser.length === 0 && (await queryRunner.hasTable('users'))) {
      await queryRunner.query(`
        ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_user"
        FOREIGN KEY ("userId") REFERENCES "users"(id) ON DELETE CASCADE
      `);
    }

    // 4. FK para companies.id (se não existir e company_id não for nulo)
    const fkCompany = (await queryRunner.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND constraint_name = 'FK_notifications_company'
    `)) as Array<{ constraint_name: string }>;

    if (fkCompany.length === 0 && (await queryRunner.hasTable('companies'))) {
      // Limpar notificações órfãs antes de adicionar FK
      await queryRunner.query(`
        DELETE FROM "notifications"
        WHERE company_id IS NULL
           OR company_id NOT IN (SELECT id FROM "companies")
      `);

      await queryRunner.query(`
        ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_company"
        FOREIGN KEY (company_id) REFERENCES "companies"(id) ON DELETE CASCADE
      `);
    }

    // 5. Índice em userId (uuid)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_userid_uuid"
      ON "notifications" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;
    if (!(await queryRunner.hasTable('notifications'))) return;

    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_notifications_userid_uuid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_company"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_user"`,
    );
  }
}
