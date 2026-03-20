import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantUniqueOperationalDocumentNumbers1709000000057 implements MigrationInterface {
  name = 'AddTenantUniqueOperationalDocumentNumbers1709000000057';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "rdos"
      SET "numero" = UPPER(TRIM("numero"))
      WHERE "numero" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "rdos"
          GROUP BY "company_id", "numero"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Existem RDOs com número duplicado na mesma empresa. Corrija os dados antes de aplicar o índice de unicidade.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_rdos_company_numero"
      ON "rdos" ("company_id", "numero")
    `);

    await queryRunner.query(`
      UPDATE "service_orders"
      SET "numero" = UPPER(TRIM("numero"))
      WHERE "numero" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "service_orders"
          GROUP BY "company_id", "numero"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Existem ordens de serviço com número duplicado na mesma empresa. Corrija os dados antes de aplicar o índice de unicidade.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_service_orders_company_numero"
      ON "service_orders" ("company_id", "numero")
    `);

    await queryRunner.query(`
      UPDATE "nonconformities"
      SET "codigo_nc" = UPPER(TRIM("codigo_nc"))
      WHERE "codigo_nc" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "nonconformities"
          WHERE "deleted_at" IS NULL
          GROUP BY "company_id", "codigo_nc"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Existem não conformidades ativas com código duplicado na mesma empresa. Corrija os dados antes de aplicar o índice de unicidade.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_nonconformities_company_codigo_nc_active"
      ON "nonconformities" ("company_id", "codigo_nc")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_nonconformities_company_codigo_nc_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_service_orders_company_numero"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_rdos_company_numero"
    `);
  }
}
