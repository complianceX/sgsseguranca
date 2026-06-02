import { MigrationInterface, QueryRunner } from 'typeorm';

export class StopWritingAprLegacyRiskItems1709000000184 implements MigrationInterface {
  name = 'StopWritingAprLegacyRiskItems1709000000184';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "aprs"
      SET "itens_risco" = NULL
      WHERE "itens_risco" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.nullify_apr_legacy_risk_items()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.itens_risco := NULL;
        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_nullify_apr_legacy_risk_items" ON "aprs";
      CREATE TRIGGER "trg_nullify_apr_legacy_risk_items"
      BEFORE INSERT OR UPDATE OF "itens_risco"
      ON "aprs"
      FOR EACH ROW
      EXECUTE FUNCTION public.nullify_apr_legacy_risk_items();
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aprs_itens_risco_gin"`);

    await queryRunner.query(`
      COMMENT ON COLUMN "aprs"."itens_risco" IS
      'DEPRECATED/blocked: legacy JSONB risk item payload. Source of truth is apr_risk_items; writes are nulled by trg_nullify_apr_legacy_risk_items.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_nullify_apr_legacy_risk_items" ON "aprs"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.nullify_apr_legacy_risk_items()`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_aprs_itens_risco_gin"
      ON "aprs" USING gin ("itens_risco")
      WHERE "itens_risco" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "aprs"."itens_risco" IS
      'DEPRECATED: legacy JSONB risk item payload. Source of truth is apr_risk_items.'
    `);
  }
}
