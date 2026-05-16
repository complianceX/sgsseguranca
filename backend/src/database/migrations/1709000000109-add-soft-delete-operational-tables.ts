import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integridade: soft delete em tabelas operacionais e de catálogo
 *
 * Problema: 10 tabelas usadas como catálogo ou documentos operacionais não tinham
 * `deleted_at`, então deleção era permanente (hard delete). Isso quebra referências
 * históricas — por exemplo, deletar um `site` rompia a relação com APRs passadas.
 *
 * Tabelas cobertas:
 *   Catálogos (referenciados por documentos históricos):
 *     sites, activities, risks, epis, tools, machines
 *   Documentos operacionais:
 *     rdos, service_orders, contracts
 *
 * ATENÇÃO: Após esta migration, adicionar @DeleteDateColumn nas entidades TypeORM
 * correspondentes. O TypeORM automaticamente injeta `WHERE deleted_at IS NULL`
 * em todas as queries quando a coluna está mapeada.
 *
 * transaction = false: usa CONCURRENTLY nos índices para evitar bloqueio.
 */
export class AddSoftDeleteOperationalTables1709000000109 implements MigrationInterface {
  name = 'AddSoftDeleteOperationalTables1709000000109';
  transaction = false;

  private readonly tables = [
    'sites',
    'activities',
    'risks',
    'epis',
    'tools',
    'machines',
    'rdos',
    'service_orders',
    'contracts',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // 1. Adicionar coluna deleted_at em cada tabela
    //    NULL = registro ativo; timestamp = soft-deletado
    // =========================================================================
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL
      `);
    }

    // =========================================================================
    // 2. Índices parciais: apenas registros deletados são indexados
    //    (partial index WHERE deleted_at IS NOT NULL — pequeno e barato)
    //    Usado por queries de limpeza e auditoria de soft-deletes.
    //
    //    Mais importante: índices WHERE deleted_at IS NULL nas colunas
    //    company_id existentes serão beneficiados automaticamente pelo planner
    //    sem precisar de novo índice.
    // =========================================================================
    for (const table of this.tables) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_${table}_deleted_at"
        ON "${table}" (deleted_at)
        WHERE deleted_at IS NOT NULL
      `);
    }

    // =========================================================================
    // 3. Índices compostos company_id + deleted_at para queries de listagem
    //    com filtro de tenant (WHERE company_id = $1 AND deleted_at IS NULL)
    //    Só para tabelas que têm company_id confirmado.
    // =========================================================================
    const tablesWithCompanyId = [
      'sites',
      'activities',
      'risks',
      'epis',
      'tools',
      'machines',
      'rdos',
      'service_orders',
      'contracts',
    ];

    for (const table of tablesWithCompanyId) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_${table}_company_active"
        ON "${table}" (company_id)
        WHERE deleted_at IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop índices compostos
    for (const table of this.tables) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_${table}_company_active"`,
      );
    }

    // Drop índices de deleted_at
    for (const table of this.tables) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_${table}_deleted_at"`,
      );
    }

    // Drop colunas deleted_at
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "deleted_at"
      `);
    }
  }
}
