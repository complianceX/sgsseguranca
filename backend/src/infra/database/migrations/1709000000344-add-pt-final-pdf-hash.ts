import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração: hash de integridade do PDF final da PT (validação séria).
 *
 * - final_pdf_hash_sha256: SHA-256 (hex) do PDF final, computado server-side em
 *   `attachPdf` via DocumentGovernanceService. Persistido na própria entidade
 *   (espelha `dds.final_pdf_hash_sha256`) para que o PDF possa exibir o hash de
 *   integridade e o portal público `/validar` confirme autenticidade.
 * - pdf_generated_at: timestamp da emissão do PDF final governado.
 *
 * Ambas as colunas são nullable; RLS herdada da tabela pts (company_id).
 * Sem índices: consultadas apenas no fetch da própria PT / registro governado.
 * O token público de validação NÃO é persistido — é emitido on-demand via
 * PublicValidationGrantService (mesmo padrão do DDS).
 */
export class AddPtFinalPdfHash1709000000344 implements MigrationInterface {
  name = 'AddPtFinalPdfHash1709000000344';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('pts');
    if (!tableExists) {
      console.warn('Table pts not found, skipping PT final PDF hash columns');
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "final_pdf_hash_sha256" varchar(64),
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('pts');
    if (!tableExists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "final_pdf_hash_sha256",
      DROP COLUMN IF EXISTS "pdf_generated_at"
    `);
  }
}
