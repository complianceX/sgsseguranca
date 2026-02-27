import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatsTable1709000000014 implements MigrationInterface {
  name = 'CreateCatsTable1709000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "numero" character varying NOT NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid,
        "contract_id" uuid,
        "worker_id" uuid,
        "data_ocorrencia" TIMESTAMP NOT NULL,
        "tipo" character varying NOT NULL DEFAULT 'tipico',
        "gravidade" character varying NOT NULL DEFAULT 'moderada',
        "descricao" text NOT NULL,
        "local_ocorrencia" text,
        "pessoas_envolvidas" jsonb,
        "acao_imediata" text,
        "investigacao_detalhes" text,
        "causa_raiz" text,
        "plano_acao_fechamento" text,
        "licoes_aprendidas" text,
        "status" character varying NOT NULL DEFAULT 'aberta',
        "opened_by_id" uuid,
        "investigated_by_id" uuid,
        "closed_by_id" uuid,
        "opened_at" TIMESTAMP,
        "investigated_at" TIMESTAMP,
        "closed_at" TIMESTAMP,
        "attachments" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cats_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cats_company_status"
      ON "cats" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cats_company_created_at"
      ON "cats" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cats_company_worker"
      ON "cats" ("company_id", "worker_id")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_company_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_site_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_site_id"
          FOREIGN KEY ("site_id") REFERENCES "sites"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_contract_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_worker_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_worker_id"
          FOREIGN KEY ("worker_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_opened_by_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_opened_by_id"
          FOREIGN KEY ("opened_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_investigated_by_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_investigated_by_id"
          FOREIGN KEY ("investigated_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_cats_closed_by_id'
        ) THEN
          ALTER TABLE "cats"
          ADD CONSTRAINT "FK_cats_closed_by_id"
          FOREIGN KEY ("closed_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_closed_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_investigated_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_opened_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_worker_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_contract_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_site_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP CONSTRAINT IF EXISTS "FK_cats_company_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cats_company_worker"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cats_company_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cats_company_status"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "cats"`);
  }
}
