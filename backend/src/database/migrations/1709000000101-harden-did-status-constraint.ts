import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenDidStatusConstraint1709000000101
  implements MigrationInterface
{
  name = 'HardenDidStatusConstraint1709000000101';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Normaliza valores de status existentes antes de aplicar o constraint.
    await queryRunner.query(`
      UPDATE "dids"
      SET "status" = LOWER(BTRIM("status"))
      WHERE "status" IS NOT NULL
    `);

    // Remove valores inválidos — fallback para rascunho.
    await queryRunner.query(`
      UPDATE "dids"
      SET "status" = 'rascunho'
      WHERE "status" NOT IN ('rascunho', 'alinhado', 'executado', 'arquivado')
    `);

    // Adiciona CHECK CONSTRAINT para garantir integridade no banco.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_dids_status'
        ) THEN
          ALTER TABLE "dids"
            ADD CONSTRAINT "chk_dids_status"
            CHECK ("status" IN ('rascunho', 'alinhado', 'executado', 'arquivado'));
        END IF;
      END $$
    `);

    // Índice composto para listagens filtradas por status dentro do tenant.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dids_company_status_created"
      ON "dids" ("company_id", "status", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_dids_company_status_created"
    `);

    await queryRunner.query(`
      ALTER TABLE "dids"
        DROP CONSTRAINT IF EXISTS "chk_dids_status"
    `);
  }
}
