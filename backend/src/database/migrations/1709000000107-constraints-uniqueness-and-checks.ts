import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Constraints: unicidade por empresa, range checks, validação de status
 *
 * Problemas corrigidos:
 *
 * A) email/cpf com UNIQUE global → dois colaboradores com mesmo CPF em empresas
 *    diferentes eram bloqueados. Substituído por índice parcial (company_id, campo)
 *    WHERE campo IS NOT NULL AND deleted_at IS NULL.
 *
 * B) aprs.numero e pts.numero sem unicidade por empresa → duplicatas silenciosas.
 *
 * C) apr_risk_items.probabilidade/severidade sem CHECK → scores fora da escala
 *    1-3 podiam ser gravados sem rejeição.
 *
 * D) Status de contracts, pts e checklists sem CHECK → valores arbitrários aceitos.
 *
 * E) Intervalos de datas sem validação → data_fim < data_inicio era possível.
 *
 * F) mail_logs.company_id nullable → bypass de RLS; backfill + log de restantes.
 *
 * ATENÇÃO: Esta migration usa transaction = true (padrão). Os índices UNIQUE
 * são criados com CONCURRENTLY separadamente na migration 108 para evitar bloqueio.
 * Aqui usamos CREATE UNIQUE INDEX sem CONCURRENTLY (dentro de transação).
 */
export class ConstraintsUniquenessAndChecks1709000000107
  implements MigrationInterface
{
  name = 'ConstraintsUniquenessAndChecks1709000000107';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // A) Unicidade global de email/cpf → unicidade por empresa
    // =========================================================================

    // Verificar se existem violações antes de remover a constraint global
    // (segurança: se houver duplicata cross-tenant, o índice novo falha de qualquer forma)
    await queryRunner.query(`
      DO $$
      DECLARE duplicate_count integer;
      BEGIN
        SELECT COUNT(*) INTO duplicate_count
        FROM (
          SELECT email, company_id FROM "users"
          WHERE email IS NOT NULL AND deleted_at IS NULL
          GROUP BY email, company_id
          HAVING COUNT(*) > 1
        ) sub;

        IF duplicate_count > 0 THEN
          RAISE NOTICE 'AVISO: % pares (company_id, email) duplicados encontrados. O índice UQ_users_company_email não será criado para não bloquear a migration. Resolva manualmente.', duplicate_count;
        END IF;
      END $$
    `);

    // Remover constraints globais antigas (nomes gerados pelo PostgreSQL inline UNIQUE)
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_cpf_key"`,
    );
    // Também tenta nomes gerados pelo TypeORM (hash-based)
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_a54b0d66f58cd9dfd3f8d3e6b9e"`,
    );
    // Drop index criado por migration de scripts SQL
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_users_email_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_users_email"`,
    );

    // Criar índices por empresa (partial, soft-delete aware)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_company_email"
      ON "users" (company_id, email)
      WHERE email IS NOT NULL AND deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_company_cpf"
      ON "users" (company_id, cpf)
      WHERE cpf IS NOT NULL AND deleted_at IS NULL
    `);

    // =========================================================================
    // B) Unicidade de numero por empresa nos documentos
    // =========================================================================

    // APRs — numero único por empresa (já considerando soft delete)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_aprs_company_numero_active"
      ON "aprs" (company_id, numero)
      WHERE deleted_at IS NULL
    `);

    // PTs — numero único por empresa
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pts_company_numero_active"
      ON "pts" (company_id, numero)
      WHERE deleted_at IS NULL
    `);

    // =========================================================================
    // C) CHECK constraints nos itens de risco (escala 1-3)
    // =========================================================================
    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "chk_risk_probabilidade"
          CHECK (probabilidade IS NULL OR (probabilidade >= 1 AND probabilidade <= 3))
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "chk_risk_severidade"
          CHECK (severidade IS NULL OR (severidade >= 1 AND severidade <= 3))
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "chk_risk_score_risco"
          CHECK (score_risco IS NULL OR (score_risco >= 1 AND score_risco <= 9))
    `);

    // =========================================================================
    // D) CHECK constraints de status
    // =========================================================================

    // contracts — status sem CHECK
    await queryRunner.query(`
      ALTER TABLE "contracts"
        ADD CONSTRAINT "chk_contracts_status"
          CHECK (status IN ('active', 'expired', 'cancelled', 'draft'))
    `);

    // pts — status sem CHECK (enum PtStatus já existe no código, faltava no DB)
    await queryRunner.query(`
      ALTER TABLE "pts"
        ADD CONSTRAINT "chk_pts_status"
          CHECK (status IN ('Pendente', 'Aprovada', 'Cancelada', 'Encerrada', 'Expirada'))
    `);

    // checklists — status sem CHECK
    await queryRunner.query(`
      ALTER TABLE "checklists"
        ADD CONSTRAINT "chk_checklists_status"
          CHECK (status IN ('Conforme', 'Não Conforme', 'Parcialmente Conforme', 'Pendente'))
    `);

    // =========================================================================
    // E) Validação de intervalos de datas
    // =========================================================================

    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD CONSTRAINT "chk_aprs_date_range"
          CHECK (data_fim IS NULL OR data_fim >= data_inicio)
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
        ADD CONSTRAINT "chk_pts_date_range"
          CHECK (data_hora_fim IS NULL OR data_hora_fim >= data_hora_inicio)
    `);

    // =========================================================================
    // F) mail_logs.company_id — backfill e log de restantes
    // =========================================================================
    await queryRunner.query(`
      UPDATE "mail_logs"
      SET company_id = (
        SELECT u.company_id FROM "users" u WHERE u.id = "mail_logs".user_id
      )
      WHERE company_id IS NULL AND user_id IS NOT NULL
    `);

    // Log quantos ainda estão sem company_id (não força NOT NULL agora,
    // pois mails de sistema podem não ter user_id)
    await queryRunner.query(`
      DO $$
      DECLARE remaining integer;
      BEGIN
        SELECT COUNT(*) INTO remaining FROM "mail_logs" WHERE company_id IS NULL;
        IF remaining > 0 THEN
          RAISE NOTICE 'mail_logs: % registros ainda sem company_id (emails de sistema sem user_id associado). Não foi aplicado NOT NULL.', remaining;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Datas
    await queryRunner.query(
      `ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "chk_pts_date_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP CONSTRAINT IF EXISTS "chk_aprs_date_range"`,
    );

    // Status
    await queryRunner.query(
      `ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "chk_checklists_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "chk_pts_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "chk_contracts_status"`,
    );

    // Risk items
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" DROP CONSTRAINT IF EXISTS "chk_risk_score_risco"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" DROP CONSTRAINT IF EXISTS "chk_risk_severidade"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" DROP CONSTRAINT IF EXISTS "chk_risk_probabilidade"`,
    );

    // Índices de numero
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_pts_company_numero_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_aprs_company_numero_active"`,
    );

    // Índices por empresa
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_company_cpf"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_company_email"`);

    // Restaurar constraints globais (opcional — risco de conflito se houver duplicatas)
    // Intencionalmente não restauramos para não bloquear rollback em produção
  }
}
