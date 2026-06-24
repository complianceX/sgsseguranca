import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração: Dedup de índices redundantes + alinhamento CHECK status de checklists
 * + índices parciais adicionais para hot paths de listagem/filtro.
 *
 * Contexto (após 0320/0321/0322):
 * - GIN em itens (0320), FK checklist_id em nonconformities + indexes (0321),
 *   composites company/site/status/created parciais (0322 + anteriores 0108/0082).
 * - CHECK chk_checklists_status (0107/0320) inclui 'Parcialmente Conforme' (legacy).
 *
 * Gaps identificados e corrigidos aqui:
 * 1. Índice redundante: 0322 criou "idx_checklists_company_status_created_partial"
 *    idêntico (mesmas colunas + WHERE) a "idx_checklists_company_status_created" de 0108.
 *    → Drop CONCURRENTLY do duplicado (economia de espaço/manutenção).
 * 2. CHECK status: inclui valor 'Parcialmente Conforme' não usado em
 *    CHECKLIST_STATUS_VALUES, deriveChecklistStatus(), DTOs ou lógica atual
 *    (apenas 'Pendente' | 'Conforme' | 'Não Conforme'). Legado pode existir em dados.
 *    → Backfill seguro + DROP + ADD CONSTRAINT com os 3 valores reais (via DO).
 * 3. Hot paths faltando partial indexes:
 *    - Filtro por inspetor (minhas inspeções, company + inspetor_id + created)
 *    - Filtro por categoria (listagens segmentadas/filtradas na API)
 *    Ambos com WHERE deleted_at IS NULL + CONCURRENTLY.
 *
 * Padrão rigoroso:
 * - transaction = false (para CONCURRENTLY)
 * - CREATE/DROP INDEX CONCURRENTLY IF NOT EXISTS
 * - Fallback não-concurrent para SQLite/dev
 * - DO blocks para constraints (idempotente, checa dados)
 * - hasTable / hasColumn guards
 * - company_id leading nos indexes (alinha com RLS tenant)
 * - Sem tocar migrations anteriores
 *
 * Timestamp: 1709000000323 (próximo após 1709000000322)
 *
 * Impacto performance: +velocidade em filtros por categoria/inspetor
 *   (evita seq scans em tabelas grandes); dedup reduz overhead.
 * Riscos: lock mínimo (CONCURRENTLY), re-runs seguros (IF + DO).
 * RLS: indexes prefixados por company_id + policies existentes não bypass.
 */
export class FixChecklistsIndexesStatusCheck1709000000323 implements MigrationInterface {
  name = 'FixChecklistsIndexesStatusCheck1709000000323';

  // CREATE/DROP INDEX CONCURRENTLY exige fora de transação explícita
  transaction = false;

  private async hasTable(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    return queryRunner.hasTable(table);
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    return queryRunner.hasColumn(table, column);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'checklists';
    if (!(await this.hasTable(queryRunner, table))) {
      console.warn('Table checklists not found, skipping 0323');
      return;
    }

    // ========================================================================
    // 1. Remover índice redundante criado em 0322 (duplicata exata de 0108)
    //    (company_id, status, created_at DESC) WHERE deleted_at IS NULL
    // ========================================================================
    const redundantIndex = 'idx_checklists_company_status_created_partial';
    try {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${redundantIndex}"`,
      );
      console.log(`✅ Dropped redundant index ${redundantIndex}`);
    } catch (_err) {
      console.warn(
        `⚠️ CONCURRENTLY drop failed for ${redundantIndex}, fallback`,
      );
      try {
        await queryRunner.query(`DROP INDEX IF EXISTS "${redundantIndex}"`);
      } catch (e2) {
        console.warn(`Could not drop ${redundantIndex}:`, e2);
      }
    }

    // ========================================================================
    // 2. Alinhar CHECK status com valores reais do código
    //    (deriveChecklistStatus, CHECKLIST_STATUS_VALUES, DTOs, entity)
    //    Valores: 'Pendente', 'Conforme', 'Não Conforme'
    //    Legacy 'Parcialmente Conforme' → backfill para 'Pendente' (conservador)
    // ========================================================================
    try {
      await queryRunner.query(`
        DO $$
        DECLARE
          legacy_count integer;
          has_legacy_constraint boolean;
        BEGIN
          -- Conta legados (para log e decisão)
          SELECT COUNT(*) INTO legacy_count
          FROM "checklists"
          WHERE status = 'Parcialmente Conforme' AND deleted_at IS NULL;

          IF legacy_count > 0 THEN
            UPDATE "checklists"
            SET status = 'Pendente', updated_at = now()
            WHERE status = 'Parcialmente Conforme';
            RAISE NOTICE 'Backfilled % checklists Parcialmente Conforme → Pendente', legacy_count;
          END IF;

          -- Verifica se constraint antiga existe
          SELECT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_checklists_status'
              AND conrelid = 'checklists'::regclass
          ) INTO has_legacy_constraint;

          IF has_legacy_constraint THEN
            ALTER TABLE "checklists" DROP CONSTRAINT "chk_checklists_status";
            RAISE NOTICE 'Dropped legacy chk_checklists_status (incluía Parcialmente Conforme)';
          END IF;

          -- Cria nova constraint alinhada (somente valores usados em deriveStatus)
          -- Checa novamente após backfill para evitar falha
          IF NOT EXISTS (
            SELECT 1 FROM "checklists"
            WHERE status IS NOT NULL
              AND status NOT IN ('Pendente','Conforme','Não Conforme')
          ) THEN
            ALTER TABLE "checklists"
              ADD CONSTRAINT "chk_checklists_status"
              CHECK (status IN ('Pendente','Conforme','Não Conforme'));
            RAISE NOTICE 'Added tightened chk_checklists_status (3 valores reais)';
          ELSE
            RAISE NOTICE 'Valores inesperados ainda presentes; constraint não recriada';
          END IF;
        END $$;
      `);
      console.log('✅ Status CHECK alinhado com deriveChecklistStatus');
    } catch (_e) {
      console.warn(
        '⚠️ Could not realign checklists status CHECK (safe to continue):',
        _e,
      );
    }

    // ========================================================================
    // 3. Novos índices parciais para hot paths de listagem/filtro
    //    - company + inspetor (minhas inspeções / filtros por responsável)
    //    - company + categoria (listagens filtradas por categoria/segmento)
    //    Ambos: partial deleted_at IS NULL + created_at DESC para ordenação padrão
    //    company_id primeiro = compatível com RLS + tenant scoping
    // ========================================================================

    // 3a. Inspector composite (alinhado com uso de inspetor_id em find/scope)
    if (await this.hasColumn(queryRunner, table, 'inspetor_id')) {
      try {
        await queryRunner.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_inspetor_created"
          ON "checklists" ("company_id", "inspetor_id", "created_at" DESC)
          WHERE "deleted_at" IS NULL
        `);
        console.log('✅ Created idx_checklists_company_inspetor_created');
      } catch (_err) {
        console.warn(
          '⚠️ CONCURRENTLY failed for inspetor index, fallback non-concurrent',
        );
        try {
          await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_checklists_company_inspetor_created"
            ON "checklists" ("company_id", "inspetor_id", "created_at" DESC)
            WHERE "deleted_at" IS NULL
          `);
        } catch (e2) {
          console.error('❌ Failed inspetor composite index:', e2);
        }
      }
    } else {
      console.warn('inspetor_id column missing, skip inspector index');
    }

    // 3b. Categoria composite (suporta filter.categoria em findPaginated + ensure presets)
    if (await this.hasColumn(queryRunner, table, 'categoria')) {
      try {
        await queryRunner.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_categoria_created"
          ON "checklists" ("company_id", "categoria", "created_at" DESC)
          WHERE "deleted_at" IS NULL
        `);
        console.log('✅ Created idx_checklists_company_categoria_created');
      } catch (_err) {
        console.warn('⚠️ CONCURRENTLY failed for categoria index, fallback');
        try {
          await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_checklists_company_categoria_created"
            ON "checklists" ("company_id", "categoria", "created_at" DESC)
            WHERE "deleted_at" IS NULL
          `);
        } catch (e2) {
          console.error('❌ Failed categoria composite index:', e2);
        }
      }
    } else {
      console.warn('categoria column missing, skip categoria index');
    }

    // GIN já tratado em 0320 — revalidação não necessária (idempotente).
    // Se quiser reforçar em futuro: mesma estrutura de 0320.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter: recriar o índice "parcial" redundante (para simetria com 0322),
    // e restaurar CHECK legacy (conservador, não perde dados).
    // NOTA: down é best-effort; em prod prefira forward-only.

    try {
      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_status_created_partial"
         ON "checklists" ("company_id", "status", "created_at" DESC)
         WHERE "deleted_at" IS NULL`,
      );
    } catch {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_checklists_company_status_created_partial"
         ON "checklists" ("company_id", "status", "created_at" DESC)
         WHERE "deleted_at" IS NULL`,
      );
    }

    // Re-adicionar legacy no CHECK (incluindo Parcialmente) se não existir
    try {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_checklists_status' AND conrelid = 'checklists'::regclass
          ) THEN
            ALTER TABLE "checklists"
              ADD CONSTRAINT "chk_checklists_status"
              CHECK (status IN ('Pendente','Conforme','Não Conforme','Parcialmente Conforme'));
          END IF;
        END $$;
      `);
    } catch (e) {
      console.warn('Down: could not restore legacy CHECK:', e);
    }

    // Drop os novos índices adicionados aqui (se existirem)
    const newIndexes = [
      'idx_checklists_company_inspetor_created',
      'idx_checklists_company_categoria_created',
    ];
    for (const idx of newIndexes) {
      try {
        await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${idx}"`);
      } catch {
        await queryRunner.query(`DROP INDEX IF EXISTS "${idx}"`);
      }
    }
  }
}
