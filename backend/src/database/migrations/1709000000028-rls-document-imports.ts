import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * document_imports usa a coluna `empresa_id` (legado) em vez de `company_id`,
 * então a migração unificada de RLS (que descobre tabelas por `company_id`)
 * não habilita RLS automaticamente para essa tabela.
 *
 * Isso cria uma brecha de isolamento multi-tenant (IDOR/BOLA) caso existam
 * endpoints que consultem registros apenas por `id`.
 *
 * Esta migração habilita RLS explicitamente em document_imports usando:
 *   empresa_id = current_company() OR is_super_admin() = true
 */
export class RlsDocumentImports1709000000028 implements MigrationInterface {
  name = 'RlsDocumentImports1709000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('document_imports');
    if (!exists) return;

    await queryRunner.query(
      `ALTER TABLE "document_imports" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_imports" FORCE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_imports"`,
    );

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "document_imports"
      USING (
        empresa_id = current_company()
        OR is_super_admin() = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('document_imports');
    if (!exists) return;

    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_imports"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_imports" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_imports" DISABLE ROW LEVEL SECURITY`,
    );
  }
}

