import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAprVersioningAndLogs1709000000002 implements MigrationInterface {
  name = 'AddAprVersioningAndLogs1709000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "versao" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "parent_apr_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "aprovado_por_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "aprovado_em" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "classificacao_resumo" jsonb`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apr_id" uuid NOT NULL,
        "usuario_id" uuid,
        "acao" character varying(100) NOT NULL,
        "metadata" jsonb,
        "data_hora" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_logs_apr_id" ON "apr_logs" ("apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_logs_usuario_id" ON "apr_logs" ("usuario_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_aprs_parent_apr_id" ON "aprs" ("parent_apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_aprs_aprovado_por_id" ON "aprs" ("aprovado_por_id")`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_apr_logs_apr_id'
        ) THEN
          ALTER TABLE "apr_logs"
          ADD CONSTRAINT "FK_apr_logs_apr_id"
          FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_aprs_parent_apr_id'
        ) THEN
          ALTER TABLE "aprs"
          ADD CONSTRAINT "FK_aprs_parent_apr_id"
          FOREIGN KEY ("parent_apr_id") REFERENCES "aprs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_aprs_aprovado_por_id'
        ) THEN
          ALTER TABLE "aprs"
          ADD CONSTRAINT "FK_aprs_aprovado_por_id"
          FOREIGN KEY ("aprovado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP CONSTRAINT IF EXISTS "FK_aprs_aprovado_por_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP CONSTRAINT IF EXISTS "FK_aprs_parent_apr_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_logs" DROP CONSTRAINT IF EXISTS "FK_apr_logs_apr_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aprs_aprovado_por_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aprs_parent_apr_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_logs_usuario_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_logs_apr_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "apr_logs"`);

    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "classificacao_resumo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "aprovado_em"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "aprovado_por_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "parent_apr_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "versao"`,
    );
  }
}
