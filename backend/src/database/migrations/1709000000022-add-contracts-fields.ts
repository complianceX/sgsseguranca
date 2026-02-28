import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige o stub da tabela "contracts" que foi criada com apenas a coluna "id"
 * para satisfazer FK constraints early (epi_assignments e cats).
 *
 * Adiciona as colunas de negócio necessárias e a FK para companies.
 * Usa ADD COLUMN IF NOT EXISTS para ser idempotente em caso de re-execução.
 */
export class AddContractsFields1709000000022 implements MigrationInterface {
  name = 'AddContractsFields1709000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona colunas de negócio (IF NOT EXISTS = idempotente)
    await queryRunner.query(`
      ALTER TABLE "contracts"
        ADD COLUMN IF NOT EXISTS "company_id"      uuid         NULL,
        ADD COLUMN IF NOT EXISTS "number"          varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "contractor_name" varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS "description"     text         NULL,
        ADD COLUMN IF NOT EXISTS "start_date"      date         NULL,
        ADD COLUMN IF NOT EXISTS "end_date"        date         NULL,
        ADD COLUMN IF NOT EXISTS "status"          varchar(20)  NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "created_at"      timestamp    NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at"      timestamp    NOT NULL DEFAULT now()
    `);

    // FK para companies — só adiciona se ainda não existe
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_contracts_company_id'
            AND table_name = 'contracts'
        ) THEN
          ALTER TABLE "contracts"
            ADD CONSTRAINT "FK_contracts_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id");
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "FK_contracts_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "contracts"
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "created_at",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "end_date",
        DROP COLUMN IF EXISTS "start_date",
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "contractor_name",
        DROP COLUMN IF EXISTS "number",
        DROP COLUMN IF EXISTS "company_id"
    `);
  }
}
