import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenRdoSchemaEnterprise1709000000087
  implements MigrationInterface
{
  name = 'HardenRdoSchemaEnterprise1709000000087';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "rdos"
      SET "status" = LOWER(BTRIM("status"))
      WHERE "status" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "rdos"
      SET "motivo_paralisacao" = NULLIF(BTRIM("motivo_paralisacao"), '')
      WHERE "motivo_paralisacao" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "rdos"
      SET "motivo_paralisacao" = NULL
      WHERE "houve_paralisacao" = false
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "rdos"
          WHERE "status" NOT IN ('rascunho', 'enviado', 'aprovado', 'cancelado')
        ) THEN
          RAISE EXCEPTION 'Existem RDOs com status inválido. Corrija os dados antes de aplicar o hardening enterprise.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "rdos"
          WHERE "houve_paralisacao" = true
            AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NULL
        ) THEN
          RAISE EXCEPTION 'Existem RDOs com paralisação sem motivo preenchido. Corrija os dados antes de aplicar o hardening enterprise.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "mao_de_obra" TYPE jsonb
      USING CASE
        WHEN "mao_de_obra" IS NULL THEN NULL
        ELSE "mao_de_obra"::jsonb
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "equipamentos" TYPE jsonb
      USING CASE
        WHEN "equipamentos" IS NULL THEN NULL
        ELSE "equipamentos"::jsonb
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "materiais_recebidos" TYPE jsonb
      USING CASE
        WHEN "materiais_recebidos" IS NULL THEN NULL
        ELSE "materiais_recebidos"::jsonb
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "servicos_executados" TYPE jsonb
      USING CASE
        WHEN "servicos_executados" IS NULL THEN NULL
        ELSE "servicos_executados"::jsonb
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "ocorrencias" TYPE jsonb
      USING CASE
        WHEN "ocorrencias" IS NULL THEN NULL
        ELSE "ocorrencias"::jsonb
      END
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "rdos"
          WHERE ("mao_de_obra" IS NOT NULL AND jsonb_typeof("mao_de_obra") <> 'array')
             OR ("equipamentos" IS NOT NULL AND jsonb_typeof("equipamentos") <> 'array')
             OR ("materiais_recebidos" IS NOT NULL AND jsonb_typeof("materiais_recebidos") <> 'array')
             OR ("servicos_executados" IS NOT NULL AND jsonb_typeof("servicos_executados") <> 'array')
             OR ("ocorrencias" IS NOT NULL AND jsonb_typeof("ocorrencias") <> 'array')
        ) THEN
          RAISE EXCEPTION 'Existem colunas estruturadas do RDO com payload inválido (esperado array JSON). Corrija os dados antes de aplicar o hardening enterprise.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_status_domain'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_status_domain"
          CHECK ("status" IN ('rascunho', 'enviado', 'aprovado', 'cancelado'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_temperatura_interval'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_temperatura_interval"
          CHECK (
            "temperatura_min" IS NULL
            OR "temperatura_max" IS NULL
            OR "temperatura_min" <= "temperatura_max"
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_motivo_paralisacao_consistency'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_motivo_paralisacao_consistency"
          CHECK (
            ("houve_paralisacao" = false AND "motivo_paralisacao" IS NULL)
            OR (
              "houve_paralisacao" = true
              AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NOT NULL
            )
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_mao_de_obra_array'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_mao_de_obra_array"
          CHECK ("mao_de_obra" IS NULL OR jsonb_typeof("mao_de_obra") = 'array');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_equipamentos_array'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_equipamentos_array"
          CHECK ("equipamentos" IS NULL OR jsonb_typeof("equipamentos") = 'array');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_materiais_recebidos_array'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_materiais_recebidos_array"
          CHECK (
            "materiais_recebidos" IS NULL
            OR jsonb_typeof("materiais_recebidos") = 'array'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_servicos_executados_array'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_servicos_executados_array"
          CHECK (
            "servicos_executados" IS NULL
            OR jsonb_typeof("servicos_executados") = 'array'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_rdos_ocorrencias_array'
        ) THEN
          ALTER TABLE "rdos"
          ADD CONSTRAINT "CHK_rdos_ocorrencias_array"
          CHECK ("ocorrencias" IS NULL OR jsonb_typeof("ocorrencias") = 'array');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rdos_company_site_data_created"
      ON "rdos" ("company_id", "site_id", "data" DESC, "created_at" DESC)
      WHERE "site_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rdos_company_status_data_created"
      ON "rdos" ("company_id", "status", "data" DESC, "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_rdos_company_status_data_created"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_rdos_company_site_data_created"
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_ocorrencias_array"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_servicos_executados_array"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_materiais_recebidos_array"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_equipamentos_array"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_mao_de_obra_array"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_motivo_paralisacao_consistency"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_temperatura_interval"
    `);
    await queryRunner.query(`
      ALTER TABLE "rdos"
      DROP CONSTRAINT IF EXISTS "CHK_rdos_status_domain"
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "ocorrencias" TYPE json
      USING CASE
        WHEN "ocorrencias" IS NULL THEN NULL
        ELSE "ocorrencias"::json
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "servicos_executados" TYPE json
      USING CASE
        WHEN "servicos_executados" IS NULL THEN NULL
        ELSE "servicos_executados"::json
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "materiais_recebidos" TYPE json
      USING CASE
        WHEN "materiais_recebidos" IS NULL THEN NULL
        ELSE "materiais_recebidos"::json
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "equipamentos" TYPE json
      USING CASE
        WHEN "equipamentos" IS NULL THEN NULL
        ELSE "equipamentos"::json
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "rdos"
      ALTER COLUMN "mao_de_obra" TYPE json
      USING CASE
        WHEN "mao_de_obra" IS NULL THEN NULL
        ELSE "mao_de_obra"::json
      END
    `);
  }
}
