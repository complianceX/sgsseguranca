import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenDdsAuditResultAndPhotoJustification1709000000099 implements MigrationInterface {
  name = 'HardenDdsAuditResultAndPhotoJustification1709000000099';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Coluna dedicada para justificativa de reuso de foto de equipe
    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD COLUMN IF NOT EXISTS "photo_reuse_justification" text;
    `);

    // 2. Remover valores inválidos de resultado_auditoria antes de adicionar a constraint
    await queryRunner.query(`
      UPDATE "dds"
        SET "resultado_auditoria" = NULL
        WHERE "resultado_auditoria" IS NOT NULL
          AND "resultado_auditoria" NOT IN ('Conforme', 'Não Conforme', 'Observação');
    `);

    // 3. Adicionar CHECK constraint para garantir apenas valores válidos
    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD CONSTRAINT "chk_dds_resultado_auditoria"
        CHECK (
          "resultado_auditoria" IS NULL
          OR "resultado_auditoria" IN ('Conforme', 'Não Conforme', 'Observação')
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP CONSTRAINT IF EXISTS "chk_dds_resultado_auditoria";
    `);
    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP COLUMN IF EXISTS "photo_reuse_justification";
    `);
  }
}
