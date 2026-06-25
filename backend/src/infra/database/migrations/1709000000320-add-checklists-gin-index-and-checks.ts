import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração: Adiciona GIN index no campo jsonb "itens" da tabela checklists.
 * Também reforça/cria CHECK constraint para status (se ainda não existir ou para alinhar).
 *
 * - GIN em jsonb permite buscas eficientes com operadores @>, ?, etc e melhora performance
 *   em listagens/filtros que eventualmente inspecionem itens (mesmo se processamento atual seja app-side).
 * - Usa CREATE INDEX CONCURRENTLY (sem lock longo em produção).
 * - transaction = false obrigatório para CONCURRENTLY.
 *
 * Impacto: Leitura mais rápida em cenários de busca em itens grandes. Sem downtime.
 * Risco: Nenhum (índice secundário).
 *
 * Timestamp: 1709000000320 (próximo após 1709000000319)
 */
export class AddChecklistsGinIndexAndChecks1709000000320 implements MigrationInterface {
  name = 'AddChecklistsGinIndexAndChecks1709000000320';

  // CREATE INDEX CONCURRENTLY não pode executar dentro de transação explícita
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('checklists');
    if (!tableExists) {
      console.warn('Table checklists not found, skipping GIN index migration');
      return;
    }

    // GIN index para o jsonb "itens"
    // Usamos IF NOT EXISTS para idempotência. GIN default suporta queries de jsonb.
    try {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_itens_gin"
        ON "checklists" USING GIN ("itens")
      `);
      console.log(
        '✅ Created GIN index idx_checklists_itens_gin on checklists.itens',
      );
    } catch (err) {
      // Em ambientes sem suporte total a CONCURRENTLY (ex: alguns testes SQLite), fallback
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        '⚠️ CONCURRENTLY GIN failed, attempting non-concurrent:',
        msg,
      );
      try {
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "idx_checklists_itens_gin"
          ON "checklists" USING GIN ("itens")
        `);
      } catch (e2) {
        console.error('❌ Failed to create GIN index on checklists.itens:', e2);
      }
    }

    // Opcional: reforçar CHECK de status se não existir (a migration 1709000000107 pode ter adicionado).
    // Mantemos compatível com valores atuais + 'Parcialmente Conforme' (legacy).
    // Usamos DO block para checar existência sem falhar em re-runs.
    try {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_checklists_status' AND conrelid = 'checklists'::regclass
          ) THEN
            -- Valida dados antes de criar constraint (evita falha se houver lixo)
            IF NOT EXISTS (
              SELECT 1 FROM "checklists"
              WHERE status IS NOT NULL
                AND status NOT IN ('Pendente','Conforme','Não Conforme','Parcialmente Conforme')
            ) THEN
              ALTER TABLE "checklists"
                ADD CONSTRAINT "chk_checklists_status"
                CHECK (status IN ('Pendente','Conforme','Não Conforme','Parcialmente Conforme'));
              RAISE NOTICE 'Added chk_checklists_status';
            ELSE
              RAISE NOTICE 'checklists.status possui valores fora do esperado; constraint não criada';
            END IF;
          ELSE
            RAISE NOTICE 'Constraint chk_checklists_status já existe';
          END IF;
        END $$;
      `);
    } catch (e) {
      console.warn(
        '⚠️ Could not ensure checklists status CHECK (may be expected):',
        e,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_checklists_itens_gin"`,
      );
    } catch {
      // fallback para ambientes sem CONCURRENTLY
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_checklists_itens_gin"`,
      );
    }

    // Não removemos a constraint de status no down para não quebrar dados; é conservador.
    // Se quiser reverter:
    // await queryRunner.query(`ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "chk_checklists_status";`);
  }
}
