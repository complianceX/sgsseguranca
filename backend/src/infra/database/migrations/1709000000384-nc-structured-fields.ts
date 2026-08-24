import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona campos estruturados à tabela nonconformities:
 * - tipo_categoria / tipo_subcategoria — categorização do tipo de NC (SGS/NR/ISO/...)
 * - risco_categoria / risco_fonte     — categorização da origem do risco
 * - fotos_evidencia                   — JSONB com file keys de fotos registradas na abertura
 * - fotos_verificacao                 — JSONB com file keys de fotos do encerramento/verificação
 *
 * Todos os campos são opcionais (nullable) para compatibilidade com NCs existentes.
 */
export class NcStructuredFields1709000000384 implements MigrationInterface {
  name = 'NcStructuredFields1709000000384';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
        ADD COLUMN IF NOT EXISTS "tipo_categoria"    VARCHAR(120)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "tipo_subcategoria" VARCHAR(120)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "risco_categoria"   VARCHAR(120)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "risco_fonte"       VARCHAR(200)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "fotos_evidencia"   JSONB         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "fotos_verificacao" JSONB         DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nonconformities_tipo_categoria"
      ON "nonconformities" ("tipo_categoria")
      WHERE "tipo_categoria" IS NOT NULL AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nonconformities_risco_categoria"
      ON "nonconformities" ("risco_categoria")
      WHERE "risco_categoria" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "IDX_nonconformities_risco_categoria"
    `);
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "IDX_nonconformities_tipo_categoria"
    `);
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
        DROP COLUMN IF EXISTS "fotos_verificacao",
        DROP COLUMN IF EXISTS "fotos_evidencia",
        DROP COLUMN IF EXISTS "risco_fonte",
        DROP COLUMN IF EXISTS "risco_categoria",
        DROP COLUMN IF EXISTS "tipo_subcategoria",
        DROP COLUMN IF EXISTS "tipo_categoria"
    `);
  }
}
