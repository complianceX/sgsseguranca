import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCapaAndApprovalColumns1709000000006 implements MigrationInterface {
  name = 'AddCapaAndApprovalColumns1709000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corrective_actions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "source_type" character varying NOT NULL DEFAULT 'manual',
        "source_id" uuid,
        "company_id" uuid NOT NULL,
        "site_id" uuid,
        "responsible_user_id" uuid,
        "responsible_name" character varying,
        "due_date" date NOT NULL,
        "status" character varying NOT NULL DEFAULT 'open',
        "priority" character varying NOT NULL DEFAULT 'medium',
        "sla_days" integer,
        "evidence_notes" text,
        "evidence_files" jsonb,
        "last_reminder_at" TIMESTAMP,
        "escalation_level" integer NOT NULL DEFAULT 0,
        "closed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_corrective_actions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "corrective_actions"
      ADD COLUMN IF NOT EXISTS "escalation_level" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs" ADD COLUMN IF NOT EXISTS "aprovado_motivo" text,
      ADD COLUMN IF NOT EXISTS "reprovado_por_id" uuid,
      ADD COLUMN IF NOT EXISTS "reprovado_em" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "reprovado_motivo" text
    `);

    await queryRunner.query(`
      ALTER TABLE "pts" ADD COLUMN IF NOT EXISTS "aprovado_por_id" uuid,
      ADD COLUMN IF NOT EXISTS "aprovado_em" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "aprovado_motivo" text,
      ADD COLUMN IF NOT EXISTS "reprovado_por_id" uuid,
      ADD COLUMN IF NOT EXISTS "reprovado_em" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "reprovado_motivo" text
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_corrective_actions_company'
        ) THEN
          ALTER TABLE "corrective_actions"
          ADD CONSTRAINT "FK_corrective_actions_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_corrective_actions_site'
        ) THEN
          ALTER TABLE "corrective_actions"
          ADD CONSTRAINT "FK_corrective_actions_site"
          FOREIGN KEY ("site_id") REFERENCES "sites"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_corrective_actions_user'
        ) THEN
          ALTER TABLE "corrective_actions"
          ADD CONSTRAINT "FK_corrective_actions_user"
          FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_aprs_reprovado_por_id'
        ) THEN
          ALTER TABLE "aprs"
          ADD CONSTRAINT "FK_aprs_reprovado_por_id"
          FOREIGN KEY ("reprovado_por_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_pts_aprovado_por_id'
        ) THEN
          ALTER TABLE "pts"
          ADD CONSTRAINT "FK_pts_aprovado_por_id"
          FOREIGN KEY ("aprovado_por_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_pts_reprovado_por_id'
        ) THEN
          ALTER TABLE "pts"
          ADD CONSTRAINT "FK_pts_reprovado_por_id"
          FOREIGN KEY ("reprovado_por_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "FK_pts_reprovado_por_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "FK_pts_aprovado_por_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP CONSTRAINT IF EXISTS "FK_aprs_reprovado_por_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "corrective_actions" DROP CONSTRAINT IF EXISTS "FK_corrective_actions_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "corrective_actions" DROP CONSTRAINT IF EXISTS "FK_corrective_actions_site"`,
    );
    await queryRunner.query(
      `ALTER TABLE "corrective_actions" DROP CONSTRAINT IF EXISTS "FK_corrective_actions_company"`,
    );

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "reprovado_motivo",
      DROP COLUMN IF EXISTS "reprovado_em",
      DROP COLUMN IF EXISTS "reprovado_por_id",
      DROP COLUMN IF EXISTS "aprovado_motivo",
      DROP COLUMN IF EXISTS "aprovado_em",
      DROP COLUMN IF EXISTS "aprovado_por_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
      DROP COLUMN IF EXISTS "reprovado_motivo",
      DROP COLUMN IF EXISTS "reprovado_em",
      DROP COLUMN IF EXISTS "reprovado_por_id",
      DROP COLUMN IF EXISTS "aprovado_motivo"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "corrective_actions"`);
  }
}
