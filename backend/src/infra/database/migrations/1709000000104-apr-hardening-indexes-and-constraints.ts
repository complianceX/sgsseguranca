import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * APR Hardening — Índices e Constraints
 *
 * 1. Partial unique index em `aprs (company_id) WHERE is_modelo_padrao = true AND deleted_at IS NULL`
 *    Garante que cada empresa tenha no máximo UM modelo padrão ativo, eliminando race condition
 *    identificada no serviço (dois UPDATEs separados que podiam sobrepor-se em concorrência).
 *
 * 2. Índice em `apr_risk_evidences (apr_id)` para acelerar listagem de evidências por APR,
 *    que até agora realizava varredura completa da tabela.
 *
 * 3. Índice em `apr_risk_evidences (apr_risk_item_id)` para joins risco→evidência.
 */
export class AprHardeningIndexesAndConstraints1709000000104 implements MigrationInterface {
  name = 'AprHardeningIndexesAndConstraints1709000000104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // 1. Partial unique index — máximo 1 modelo padrão ativo por empresa
    // =========================================================================
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_aprs_modelo_padrao_per_company"
      ON "aprs" (company_id)
      WHERE is_modelo_padrao = true AND deleted_at IS NULL
    `);

    // =========================================================================
    // 2. Índice em apr_risk_evidences.apr_id
    //    Usado em: listagem de evidências por APR, joins em PDF generation
    // =========================================================================
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_apr_id"
      ON "apr_risk_evidences" (apr_id)
    `);

    // =========================================================================
    // 3. Índice em apr_risk_evidences.apr_risk_item_id
    //    Usado em: resolução de evidências por item de risco
    // =========================================================================
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apr_risk_evidences_risk_item_id"
      ON "apr_risk_evidences" (apr_risk_item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_risk_item_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_evidences_apr_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_aprs_modelo_padrao_per_company"`,
    );
  }
}
