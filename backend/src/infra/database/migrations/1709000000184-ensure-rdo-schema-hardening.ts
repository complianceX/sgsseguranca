import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garante o hardening do schema de RDOs com constraints CHECK e índices compostos.
 *
 * Resolve o conflito de timestamp com 1709000000087-harden-rdo-schema-enterprise.ts,
 * que pode nunca ter sido executado em ambientes que já tinham
 * 1709000000087-enterprise-performance-composite-indexes.ts registrado.
 *
 * Todas as operações são idempotentes via guards IF NOT EXISTS.
 */
export class EnsureRdoSchemaHardening1709000000184 implements MigrationInterface {
  name = 'EnsureRdoSchemaHardening1709000000184';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('rdos');
    if (!hasTable) return;

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

    for (const col of [
      'mao_de_obra',
      'equipamentos',
      'materiais_recebidos',
      'servicos_executados',
      'ocorrencias',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "rdos"
        ALTER COLUMN "${col}" TYPE jsonb
        USING CASE
          WHEN "${col}" IS NULL THEN NULL
          ELSE "${col}"::jsonb
        END
      `);
    }

    const constraints: Array<[string, string]> = [
      [
        'CHK_rdos_status_domain',
        `"status" IN ('rascunho', 'enviado', 'aprovado', 'cancelado')`,
      ],
      [
        'CHK_rdos_temperatura_interval',
        `"temperatura_min" IS NULL OR "temperatura_max" IS NULL OR "temperatura_min" <= "temperatura_max"`,
      ],
      [
        'CHK_rdos_motivo_paralisacao_consistency',
        `("houve_paralisacao" = false AND "motivo_paralisacao" IS NULL) OR ("houve_paralisacao" = true AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NOT NULL)`,
      ],
      [
        'CHK_rdos_mao_de_obra_array',
        `"mao_de_obra" IS NULL OR jsonb_typeof("mao_de_obra") = 'array'`,
      ],
      [
        'CHK_rdos_equipamentos_array',
        `"equipamentos" IS NULL OR jsonb_typeof("equipamentos") = 'array'`,
      ],
      [
        'CHK_rdos_materiais_recebidos_array',
        `"materiais_recebidos" IS NULL OR jsonb_typeof("materiais_recebidos") = 'array'`,
      ],
      [
        'CHK_rdos_servicos_executados_array',
        `"servicos_executados" IS NULL OR jsonb_typeof("servicos_executados") = 'array'`,
      ],
      [
        'CHK_rdos_ocorrencias_array',
        `"ocorrencias" IS NULL OR jsonb_typeof("ocorrencias") = 'array'`,
      ],
    ];

    for (const [name, check] of constraints) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${name}'
          ) THEN
            ALTER TABLE "rdos" ADD CONSTRAINT "${name}" CHECK (${check});
          END IF;
        END $$;
      `);
    }

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
    const hasTable = await queryRunner.hasTable('rdos');
    if (!hasTable) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_rdos_company_status_data_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_rdos_company_site_data_created"`,
    );

    for (const name of [
      'CHK_rdos_ocorrencias_array',
      'CHK_rdos_servicos_executados_array',
      'CHK_rdos_materiais_recebidos_array',
      'CHK_rdos_equipamentos_array',
      'CHK_rdos_mao_de_obra_array',
      'CHK_rdos_motivo_paralisacao_consistency',
      'CHK_rdos_temperatura_interval',
      'CHK_rdos_status_domain',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "rdos" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    }

    for (const col of [
      'mao_de_obra',
      'equipamentos',
      'materiais_recebidos',
      'servicos_executados',
      'ocorrencias',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "rdos"
        ALTER COLUMN "${col}" TYPE json
        USING CASE
          WHEN "${col}" IS NULL THEN NULL
          ELSE "${col}"::json
        END
      `);
    }
  }
}
