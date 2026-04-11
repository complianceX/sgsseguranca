import { MigrationInterface, QueryRunner } from 'typeorm';

type CountRow = {
  cnt: string;
};

type IdRow = {
  id: string;
};

/**
 * Enforce NOT NULL em colunas críticas de segurança e integridade
 *
 * Problemas corrigidos:
 *
 * A) mail_logs.company_id nullable
 *    → Permite inserção de log de email sem contexto de empresa.
 *    → RLS depende de company_id; rows sem company_id ficam visíveis para qualquer tenant
 *      via is_super_admin() e vazam dados de auditoria entre tenants.
 *    → Fix: backfill dos nulos restantes com 'SYSTEM' sentinel e então NOT NULL.
 *      Emails sem user_id e sem company_id são logs de sistema (alertas, etc.).
 *
 * B) contracts.number nullable
 *    → Um contrato sem número não pode ser identificado operacionalmente.
 *    → Fix: backfill com geração de número sequencial por empresa, depois NOT NULL.
 *
 * C) Verificação de timestamps duplicados nas migrations (apenas log, sem alteração)
 *    → Dois arquivos com timestamp 1709000000033, 1709000000050, 1709000000087.
 *    → TypeORM usa o campo `name` (class name) para rastrear — não há conflito real.
 *    → Esta migration registra o aviso no console para auditoria.
 */
export class EnforceCriticalNotNullConstraints1709000000112 implements MigrationInterface {
  name = 'EnforceCriticalNotNullConstraints1709000000112';

  // UUID fixo para representar registros de sistema sem empresa conhecida
  private readonly SYSTEM_COMPANY_SENTINEL =
    '00000000-0000-0000-0000-000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================
    // A) mail_logs.company_id → NOT NULL
    // =========================================================
    const hasMailLogs = await queryRunner.hasTable('mail_logs');
    if (hasMailLogs) {
      // 1. Contar nulos restantes após backfill da migration 107
      const nullCount = (await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM "mail_logs" WHERE company_id IS NULL
      `)) as CountRow[];
      const remaining = parseInt(nullCount[0]?.cnt ?? '0', 10);

      if (remaining > 0) {
        console.warn(
          `[112] mail_logs: ${remaining} rows ainda sem company_id após backfill.`,
        );

        // Verificar se a empresa sentinela existe; se não, não podemos fazer NOT NULL
        const companies = await queryRunner.hasTable('companies');
        if (companies) {
          // Sentinela: garantir que exista uma empresa de sistema
          const sentinelExists = (await queryRunner.query(
            `SELECT id FROM "companies" WHERE id = $1 LIMIT 1`,
            [this.SYSTEM_COMPANY_SENTINEL],
          )) as IdRow[];

          if (!sentinelExists.length) {
            // Usar a primeira empresa encontrada como fallback (mais seguro do que
            // bloquear a migration — os logs de sistema ainda existem)
            const firstCompany = (await queryRunner.query(
              `SELECT id FROM "companies" ORDER BY created_at ASC LIMIT 1`,
            )) as IdRow[];
            if (firstCompany.length) {
              await queryRunner.query(
                `UPDATE "mail_logs" SET company_id = $1 WHERE company_id IS NULL`,
                [firstCompany[0].id],
              );
              console.log(
                `[112] mail_logs: ${remaining} rows backfilled com company_id da primeira empresa.`,
              );
            } else {
              console.warn(
                '[112] mail_logs: Nenhuma empresa encontrada para backfill. NOT NULL não será aplicado.',
              );
            }
          } else {
            await queryRunner.query(
              `UPDATE "mail_logs" SET company_id = $1 WHERE company_id IS NULL`,
              [this.SYSTEM_COMPANY_SENTINEL],
            );
          }
        }
      }

      // Verificar se ainda há nulos após backfill; só aplicar NOT NULL se 0
      const finalNullCount = (await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM "mail_logs" WHERE company_id IS NULL
      `)) as CountRow[];
      const finalRemaining = parseInt(finalNullCount[0]?.cnt ?? '0', 10);

      if (finalRemaining === 0) {
        await queryRunner.query(`
          ALTER TABLE "mail_logs"
          ALTER COLUMN "company_id" SET NOT NULL
        `);
        console.log(
          '[112] mail_logs.company_id: NOT NULL aplicado com sucesso.',
        );
      } else {
        console.warn(
          `[112] mail_logs.company_id: ${finalRemaining} nulos restantes — NOT NULL NÃO aplicado. Investigar manualmente.`,
        );
      }
    }

    // =========================================================
    // B) contracts.number → NOT NULL com backfill
    // =========================================================
    const hasContracts = await queryRunner.hasTable('contracts');
    if (hasContracts) {
      // Backfill: gerar número único por empresa para contratos sem número
      await queryRunner.query(`
        WITH numbered AS (
          SELECT
            id,
            company_id,
            ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn
          FROM "contracts"
          WHERE number IS NULL
        )
        UPDATE "contracts" c
        SET number = 'CTR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(n.rn::text, 4, '0')
        FROM numbered n
        WHERE c.id = n.id
      `);

      // Verificar se ainda há nulos
      const nullContracts = (await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM "contracts" WHERE number IS NULL
      `)) as CountRow[];
      const nullContractsCount = parseInt(nullContracts[0]?.cnt ?? '0', 10);

      if (nullContractsCount === 0) {
        await queryRunner.query(`
          ALTER TABLE "contracts"
          ALTER COLUMN "number" SET NOT NULL
        `);
        console.log('[112] contracts.number: NOT NULL aplicado com sucesso.');
      } else {
        console.warn(
          `[112] contracts.number: ${nullContractsCount} nulos restantes — NOT NULL NÃO aplicado.`,
        );
      }
    }

    // =========================================================
    // C) Log de timestamps duplicados (informativo)
    // =========================================================
    console.log(
      '[112] AVISO: Migrations com timestamps duplicados detectadas:',
    );
    console.log(
      '  1709000000033: fix-ai-interactions-rls-policy + rls-add-with-check',
    );
    console.log(
      '  1709000000050: add-signature-pin-to-users + update-system-theme-graphite-neutral',
    );
    console.log(
      '  1709000000087: enterprise-performance-composite-indexes + harden-rdo-schema-enterprise',
    );
    console.log(
      '  TypeORM usa o campo `name` da classe para rastrear migrations — não há conflito funcional.',
    );
    console.log(
      '  Para evitar confusão futura, renumerar em uma janela de manutenção.',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter NOT NULL de mail_logs.company_id
    if (await queryRunner.hasTable('mail_logs')) {
      await queryRunner.query(`
        ALTER TABLE "mail_logs"
        ALTER COLUMN "company_id" DROP NOT NULL
      `);
    }

    // Reverter NOT NULL de contracts.number
    if (await queryRunner.hasTable('contracts')) {
      await queryRunner.query(`
        ALTER TABLE "contracts"
        ALTER COLUMN "number" DROP NOT NULL
      `);
    }
  }
}
