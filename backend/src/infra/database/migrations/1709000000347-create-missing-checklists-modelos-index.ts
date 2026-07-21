import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria o índice `idx_checklists_company_modelos_created`, que nunca chegou a
 * existir em ambientes já provisionados.
 *
 * CONTEXTO
 *   A migration 1709000000322 montava o SQL do índice concatenando o predicado
 *   parcial sem o prefixo `WHERE`, produzindo
 *   `... ("company_id", "is_modelo", "created_at" DESC)"is_modelo" = true ...`.
 *   O comando falhava com erro de sintaxe, mas a exceção era capturada e apenas
 *   registrada em log — a migration seguia como bem-sucedida e o índice ficava
 *   ausente silenciosamente.
 *
 *   A 322 foi corrigida para bancos criados do zero; como ela já consta como
 *   aplicada nos ambientes existentes, não é reexecutada — daí esta migration
 *   complementar, que apenas cria o índice faltante de forma idempotente.
 *
 * IMPACTO
 *   O índice cobre a biblioteca de modelos de checklist e o `ensureCompanyPresets`
 *   (filtro por empresa + `is_modelo`, ordenado por criação). Sem ele, essas
 *   listagens recorrem a varredura sequencial em `checklists`.
 */
export class CreateMissingChecklistsModelosIndex1709000000347
  implements MigrationInterface
{
  name = 'CreateMissingChecklistsModelosIndex1709000000347';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('checklists');
    if (!hasTable) {
      return;
    }

    for (const column of ['company_id', 'is_modelo', 'created_at', 'deleted_at']) {
      if (!(await queryRunner.hasColumn('checklists', column))) {
        return;
      }
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_modelos_created"
      ON "checklists" ("company_id", "is_modelo", "created_at" DESC)
      WHERE "is_modelo" = true AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_checklists_company_modelos_created"`,
    );
  }
}
