import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PERFORMANCE: Composite indexes adicionais para listagens de Checklists/Inspeções.
 *
 * Foco:
 * - company_id + site_id + status + created_at (listagens por obra + status)
 * - company_id + site_id + created_at (ordenação padrão por data)
 * - company_id + is_modelo + created_at (biblioteca de modelos)
 * - company_id + status + created_at (com partial deleted_at)
 *
 * Todos com CREATE INDEX CONCURRENTLY + transaction=false.
 * Parciais em deleted_at IS NULL para queries comuns que filtram soft-deletes.
 *
 * Alinha com requisitos:
 * - índices compostos CONCURRENTLY
 * - performance em listagens (company_id + site + status + created_at etc.)
 *
 * Evita duplicar índices existentes (ex: idx_checklists_company_created_status já existe).
 */
export class AddChecklistsCompositeIndexes1709000000322 implements MigrationInterface {
  name = 'AddChecklistsCompositeIndexes1709000000322';

  transaction = false;

  private readonly indexes = [
    {
      name: 'idx_checklists_company_site_status_created',
      table: 'checklists',
      columns: ['company_id', 'site_id', 'status', 'created_at DESC'],
      partial: true,
      comment:
        'Listagens por obra + status ordenado por data (principal hot path)',
    },
    {
      name: 'idx_checklists_company_site_created',
      table: 'checklists',
      columns: ['company_id', 'site_id', 'created_at DESC'],
      partial: true,
      comment: 'Listagens padrão por obra ordenadas por criação',
    },
    {
      name: 'idx_checklists_company_modelos_created',
      table: 'checklists',
      columns: ['company_id', 'is_modelo', 'created_at DESC'],
      partial: false, // modelos raramente deletados, mas ok
      where: '"is_modelo" = true AND "deleted_at" IS NULL',
      comment:
        'Templates/modelos por empresa (usado em ensureCompanyPresets e biblioteca)',
    },
    {
      name: 'idx_checklists_company_status_created_partial',
      table: 'checklists',
      columns: ['company_id', 'status', 'created_at DESC'],
      partial: true,
      comment:
        'Fallback para listagens sem site filter (super admin / all sites)',
    },
    // Para nonconformities: reforça índice útil com site+status (além do checklist_id)
    {
      name: 'idx_nonconformities_company_site_status',
      table: 'nonconformities',
      columns: ['company_id', 'site_id', 'status', 'closed_at DESC'],
      partial: true,
      comment:
        'Listagens de NCs por obra + status (complementa migration anterior)',
    },
  ];

  private formatColumn(col: string): string {
    const m = col.match(/^(.+?)\s+(ASC|DESC)$/i);
    if (m) {
      return `"${m[1]}" ${m[2].toUpperCase()}`;
    }
    return `"${col}"`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const idx of this.indexes) {
      const existsTable = await queryRunner.hasTable(idx.table);
      if (!existsTable) {
        console.warn(`Table ${idx.table} missing, skip ${idx.name}`);
        continue;
      }

      const cols = idx.columns.map((c) => c.replace(/\s+(ASC|DESC)$/i, ''));
      let allCols = true;
      for (const c of cols) {
        if (!(await queryRunner.hasColumn(idx.table, c))) {
          allCols = false;
          break;
        }
      }
      if (!allCols) {
        console.warn(`Missing columns for ${idx.name}, skip`);
        continue;
      }

      const colList = idx.columns.map((c) => this.formatColumn(c)).join(', ');
      // `idx.where` guarda apenas o predicado; o prefixo WHERE precisa ser
      // adicionado aqui. Sem isso o SQL saía como `(...colunas...)"is_modelo" = true`,
      // falhando com erro de sintaxe — e como a falha era engolida pelo catch
      // abaixo, o índice simplesmente não era criado.
      const filter = idx.where
        ? ` WHERE ${idx.where}`
        : idx.partial
          ? ' WHERE "deleted_at" IS NULL'
          : '';

      const sql = `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${idx.name}"
        ON "${idx.table}" (${colList})${filter}
      `;

      try {
        await queryRunner.query(sql);
        console.log(`✅ ${idx.name} created`);
      } catch (_e) {
        console.warn(`⚠️ CONCURRENTLY failed for ${idx.name}, fallback...`);
        try {
          await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "${idx.name}"
            ON "${idx.table}" (${colList})${filter}
          `);
        } catch (e2) {
          console.error(`❌ index ${idx.name} failed:`, e2);
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const idx of this.indexes) {
      try {
        await queryRunner.query(
          `DROP INDEX CONCURRENTLY IF EXISTS "${idx.name}"`,
        );
      } catch {
        await queryRunner.query(`DROP INDEX IF EXISTS "${idx.name}"`);
      }
    }
  }
}
