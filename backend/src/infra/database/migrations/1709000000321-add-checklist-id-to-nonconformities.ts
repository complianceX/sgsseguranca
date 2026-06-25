import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração: Adiciona coluna checklist_id (uuid, nullable) + FK para checklists na tabela nonconformities.
 *
 * - Permite associar uma não conformidade ao checklist de inspeção que a gerou (rastreabilidade).
 * - Nullable: nem toda NC vem de checklist.
 * - ON DELETE SET NULL: ao remover checklist, a referência na NC é limpa (preserva histórico da NC).
 *
 * Inclui:
 * - ALTER TABLE ADD COLUMN IF NOT EXISTS
 * - ADD CONSTRAINT FK (com IF NOT EXISTS via DO block para compatibilidade)
 * - CREATE INDEX CONCURRENTLY no checklist_id (essencial para joins/filtros por checklist)
 *
 * transaction = false para o INDEX CONCURRENTLY.
 *
 * Próximo passo: usar a FK no service de NCs se necessário (ex: ao criar NC a partir de checklist).
 *
 * Impacto de lock: mínimo (nullable column + concurrent index).
 */
export class AddChecklistIdToNonconformities1709000000321 implements MigrationInterface {
  name = 'AddChecklistIdToNonconformities1709000000321';

  // Necessário por causa do CREATE INDEX CONCURRENTLY
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('nonconformities');
    if (!tableExists) {
      console.warn(
        'Table nonconformities not found, skipping checklist_id addition',
      );
      return;
    }

    // 1. Adiciona a coluna (nullable, sem default)
    await queryRunner.query(`
      ALTER TABLE "nonconformities"
      ADD COLUMN IF NOT EXISTS "checklist_id" uuid NULL
    `);

    // 2. Cria a FK se não existir.
    // Usamos DO $$ para verificar existência de constraint de forma segura (compatível com re-runs e diferentes DBs).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_nonconformities_checklist_id'
            AND conrelid = 'nonconformities'::regclass
        ) THEN
          ALTER TABLE "nonconformities"
            ADD CONSTRAINT "FK_nonconformities_checklist_id"
            FOREIGN KEY ("checklist_id")
            REFERENCES "checklists"("id")
            ON DELETE SET NULL;
          RAISE NOTICE 'FK_nonconformities_checklist_id criada';
        ELSE
          RAISE NOTICE 'FK_nonconformities_checklist_id já existe';
        END IF;
      END $$;
    `);

    // 3. Índice CONCURRENTLY para performance (joins por checklist_id, listagens filtradas por checklist)
    // Mesmo sendo FK, Postgres não cria índice automático em FKs no lado referenciado.
    try {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_checklist_id"
        ON "nonconformities" ("checklist_id")
      `);
      console.log('✅ Created index idx_nonconformities_checklist_id');
    } catch (_err) {
      console.warn(
        '⚠️ CONCURRENTLY index failed, fallback non-concurrent for idx_nonconformities_checklist_id',
      );
      try {
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "idx_nonconformities_checklist_id"
          ON "nonconformities" ("checklist_id")
        `);
      } catch (e2) {
        console.error(
          'Failed to create index on nonconformities.checklist_id',
          e2,
        );
      }
    }

    // 4. Opcional: índice composto útil para listagens NC por checklist + status
    // (pode ser usado em queries futuras de "NCs abertas deste checklist")
    try {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_checklist_status"
        ON "nonconformities" ("checklist_id", "status")
        WHERE "deleted_at" IS NULL
      `);
    } catch (_err) {
      try {
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "idx_nonconformities_checklist_status"
          ON "nonconformities" ("checklist_id", "status")
          WHERE "deleted_at" IS NULL
        `);
      } catch {
        /* noop - best effort for optional index */
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover índices primeiro
    try {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_nonconformities_checklist_status"`,
      );
    } catch {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_nonconformities_checklist_status"`,
      );
    }

    try {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_nonconformities_checklist_id"`,
      );
    } catch {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_nonconformities_checklist_id"`,
      );
    }

    // Dropar FK
    await queryRunner.query(`
      ALTER TABLE "nonconformities" DROP CONSTRAINT IF EXISTS "FK_nonconformities_checklist_id"
    `);

    // Dropar coluna (cuidado em prod, mas para reversão completa)
    await queryRunner.query(`
      ALTER TABLE "nonconformities" DROP COLUMN IF EXISTS "checklist_id"
    `);
  }
}
