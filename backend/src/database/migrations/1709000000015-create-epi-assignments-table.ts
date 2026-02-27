import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEpiAssignmentsTable1709000000015 implements MigrationInterface {
  name = 'CreateEpiAssignmentsTable1709000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "epi_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "epi_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "site_id" uuid,
        "contract_id" uuid,
        "ca" character varying,
        "validade_ca" date,
        "quantidade" integer NOT NULL DEFAULT 1,
        "status" character varying NOT NULL DEFAULT 'entregue',
        "entregue_em" TIMESTAMP NOT NULL,
        "devolvido_em" TIMESTAMP,
        "motivo_devolucao" text,
        "observacoes" text,
        "assinatura_entrega" jsonb NOT NULL,
        "assinatura_devolucao" jsonb,
        "created_by_id" uuid,
        "updated_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_epi_assignments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_status"
      ON "epi_assignments" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_user"
      ON "epi_assignments" ("company_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_created_at"
      ON "epi_assignments" ("company_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_epi_assignments_company_id'
        ) THEN
          ALTER TABLE "epi_assignments"
          ADD CONSTRAINT "FK_epi_assignments_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_epi_assignments_epi_id'
        ) THEN
          ALTER TABLE "epi_assignments"
          ADD CONSTRAINT "FK_epi_assignments_epi_id"
          FOREIGN KEY ("epi_id") REFERENCES "epis"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_epi_assignments_user_id'
        ) THEN
          ALTER TABLE "epi_assignments"
          ADD CONSTRAINT "FK_epi_assignments_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_epi_assignments_site_id'
        ) THEN
          ALTER TABLE "epi_assignments"
          ADD CONSTRAINT "FK_epi_assignments_site_id"
          FOREIGN KEY ("site_id") REFERENCES "sites"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_epi_assignments_contract_id'
        ) THEN
          ALTER TABLE "epi_assignments"
          ADD CONSTRAINT "FK_epi_assignments_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP CONSTRAINT IF EXISTS "FK_epi_assignments_contract_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP CONSTRAINT IF EXISTS "FK_epi_assignments_site_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP CONSTRAINT IF EXISTS "FK_epi_assignments_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP CONSTRAINT IF EXISTS "FK_epi_assignments_epi_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "epi_assignments" DROP CONSTRAINT IF EXISTS "FK_epi_assignments_company_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_epi_assignments_company_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_epi_assignments_company_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_epi_assignments_company_status"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "epi_assignments"`);
  }
}
