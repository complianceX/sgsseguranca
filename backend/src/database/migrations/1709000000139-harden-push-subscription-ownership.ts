import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenPushSubscriptionOwnership1709000000139
  implements MigrationInterface
{
  name = 'HardenPushSubscriptionOwnership1709000000139';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      ADD COLUMN IF NOT EXISTS "tenantId" uuid
    `);

    await queryRunner.query(`
      UPDATE "push_subscriptions" ps
      SET
        "userId" = u.id::text,
        "tenantId" = u.company_id
      FROM "users" u
      WHERE u.deleted_at IS NULL
        AND u.status = true
        AND (
          u.id::text = ps."userId"::text
          OR (
            u.auth_user_id IS NOT NULL
            AND u.auth_user_id::text = ps."userId"::text
          )
        )
    `);

    await queryRunner.query(`
      DELETE FROM "push_subscriptions"
      WHERE "tenantId" IS NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'push_subscriptions'
            AND column_name = 'userId'
            AND data_type IN ('character varying', 'text')
        ) THEN
          DELETE FROM "push_subscriptions"
          WHERE "userId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

          ALTER TABLE "push_subscriptions"
          ALTER COLUMN "userId" TYPE uuid
          USING "userId"::uuid;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DELETE FROM "push_subscriptions" a
      USING "push_subscriptions" b
      WHERE a.endpoint = b.endpoint
        AND a.ctid < b.ctid
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      ALTER COLUMN "userId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      ALTER COLUMN "tenantId" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_push_subscriptions_user'
        ) THEN
          ALTER TABLE "push_subscriptions"
          ADD CONSTRAINT "FK_push_subscriptions_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_push_subscriptions_tenant'
        ) THEN
          ALTER TABLE "push_subscriptions"
          ADD CONSTRAINT "FK_push_subscriptions_tenant"
          FOREIGN KEY ("tenantId") REFERENCES "companies"("id")
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_subscriptions_endpoint"
      ON "push_subscriptions" ("endpoint")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_tenant_user_endpoint"
      ON "push_subscriptions" ("tenantId", "userId", "endpoint")
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "description")
      VALUES (
        'can_manage_push_subscriptions',
        'Permite gerenciar subscriptions de push notifications'
      )
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT rp."role_id", p_new."id"
      FROM "permissions" p_old
      INNER JOIN "role_permissions" rp
        ON rp."permission_id" = p_old."id"
      INNER JOIN "permissions" p_new
        ON p_new."name" = 'can_manage_push_subscriptions'
      LEFT JOIN "role_permissions" rp_existing
        ON rp_existing."role_id" = rp."role_id"
       AND rp_existing."permission_id" = p_new."id"
      WHERE p_old."name" = 'can_manage_notifications'
        AND rp_existing."role_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id"
        FROM "permissions"
        WHERE "name" = 'can_manage_push_subscriptions'
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "name" = 'can_manage_push_subscriptions'
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_push_subscriptions_tenant_user_endpoint"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_push_subscriptions_endpoint"
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_push_subscriptions_tenant"
    `);
    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_push_subscriptions_user"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'push_subscriptions'
            AND column_name = 'userId'
            AND data_type = 'uuid'
        ) THEN
          ALTER TABLE "push_subscriptions"
          ALTER COLUMN "userId" TYPE varchar
          USING "userId"::text;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      DROP COLUMN IF EXISTS "tenantId"
    `);
  }
}

