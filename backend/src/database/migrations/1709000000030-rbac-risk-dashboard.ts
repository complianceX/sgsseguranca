import { MigrationInterface, QueryRunner } from 'typeorm';

export class RbacRiskDashboard1709000000030 implements MigrationInterface {
  name = 'RbacRiskDashboard1709000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "name" varchar NOT NULL UNIQUE,
        "description" text NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "name" varchar NOT NULL UNIQUE,
        "description" text NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_user_roles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_roles_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ADD COLUMN IF NOT EXISTS "user_id" varchar NULL,
      ADD COLUMN IF NOT EXISTS "entity_type" varchar NULL,
      ADD COLUMN IF NOT EXISTS "entity_id" varchar NULL,
      ADD COLUMN IF NOT EXISTS "before" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "after" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "created_at" timestamp NULL
    `);

    await queryRunner.query(`
      UPDATE "audit_logs"
      SET
        "user_id" = COALESCE("user_id", "userId"),
        "entity_type" = COALESCE("entity_type", "entity"),
        "entity_id" = COALESCE("entity_id", "entityId"),
        "created_at" = COALESCE("created_at", "timestamp")
      WHERE "user_id" IS NULL
         OR "entity_type" IS NULL
         OR "entity_id" IS NULL
         OR "created_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "risks"
      ADD COLUMN IF NOT EXISTS "probability" integer NULL,
      ADD COLUMN IF NOT EXISTS "severity" integer NULL,
      ADD COLUMN IF NOT EXISTS "exposure" integer NULL,
      ADD COLUMN IF NOT EXISTS "initial_risk" integer NULL,
      ADD COLUMN IF NOT EXISTS "residual_risk" varchar NULL,
      ADD COLUMN IF NOT EXISTS "control_hierarchy" varchar NULL,
      ADD COLUMN IF NOT EXISTS "evidence_photo" text NULL,
      ADD COLUMN IF NOT EXISTS "evidence_document" text NULL,
      ADD COLUMN IF NOT EXISTS "control_description" text NULL,
      ADD COLUMN IF NOT EXISTS "control_evidence" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
      ADD COLUMN IF NOT EXISTS "probability" integer NULL,
      ADD COLUMN IF NOT EXISTS "severity" integer NULL,
      ADD COLUMN IF NOT EXISTS "exposure" integer NULL,
      ADD COLUMN IF NOT EXISTS "initial_risk" integer NULL,
      ADD COLUMN IF NOT EXISTS "residual_risk" varchar NULL,
      ADD COLUMN IF NOT EXISTS "evidence_photo" text NULL,
      ADD COLUMN IF NOT EXISTS "evidence_document" text NULL,
      ADD COLUMN IF NOT EXISTS "control_description" text NULL,
      ADD COLUMN IF NOT EXISTS "control_evidence" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "probability" integer NULL,
      ADD COLUMN IF NOT EXISTS "severity" integer NULL,
      ADD COLUMN IF NOT EXISTS "exposure" integer NULL,
      ADD COLUMN IF NOT EXISTS "initial_risk" integer NULL,
      ADD COLUMN IF NOT EXISTS "residual_risk" varchar NULL,
      ADD COLUMN IF NOT EXISTS "evidence_photo" text NULL,
      ADD COLUMN IF NOT EXISTS "evidence_document" text NULL,
      ADD COLUMN IF NOT EXISTS "control_description" text NULL,
      ADD COLUMN IF NOT EXISTS "control_evidence" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_history" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "risk_id" uuid NOT NULL,
        "changed_by" varchar NULL,
        "old_value" jsonb NOT NULL,
        "new_value" jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_risk_history_risk_id" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "monthly_snapshots" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "month" varchar NOT NULL,
        "site_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "risk_score" numeric(10,2) NOT NULL DEFAULT 0,
        "nc_count" integer NOT NULL DEFAULT 0,
        "training_compliance" numeric(5,2) NOT NULL DEFAULT 0,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_monthly_snapshots_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_monthly_snapshots_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_monthly_snapshots_company_month"
      ON "monthly_snapshots" ("company_id", "month")
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "description")
      VALUES
        ('can_view_risks', 'Permite visualizar e atualizar risco'),
        ('can_create_apr', 'Permite criar APR'),
        ('can_approve_pt', 'Permite aprovar PT'),
        ('can_manage_nc', 'Permite gerenciar não conformidades'),
        ('can_view_dashboard', 'Permite visualizar dashboards executivos')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description")
      VALUES
        ('Administrador Geral', 'Acesso administrativo global'),
        ('Administrador da Empresa', 'Acesso administrativo por empresa'),
        ('Técnico de Segurança do Trabalho (TST)', 'Acesso técnico SST'),
        ('Supervisor / Encarregado', 'Acesso de supervisão operacional'),
        ('Operador / Colaborador', 'Acesso operacional limitado')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN (
        'can_view_risks',
        'can_create_apr',
        'can_approve_pt',
        'can_manage_nc',
        'can_view_dashboard'
      )
      WHERE r.name IN (
        'Administrador Geral',
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN (
        'can_view_risks',
        'can_create_apr',
        'can_view_dashboard'
      )
      WHERE r.name = 'Supervisor / Encarregado'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN ('can_create_apr', 'can_view_dashboard')
      WHERE r.name = 'Operador / Colaborador'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "user_roles" ("user_id", "role_id")
      SELECT u.id, r.id
      FROM users u
      JOIN profiles p ON p.id = u.profile_id
      JOIN roles r ON r.name = p.nome
      ON CONFLICT ("user_id", "role_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_monthly_snapshots_company_month"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "monthly_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_history"`);

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "control_evidence",
      DROP COLUMN IF EXISTS "control_description",
      DROP COLUMN IF EXISTS "evidence_document",
      DROP COLUMN IF EXISTS "evidence_photo",
      DROP COLUMN IF EXISTS "residual_risk",
      DROP COLUMN IF EXISTS "initial_risk",
      DROP COLUMN IF EXISTS "exposure",
      DROP COLUMN IF EXISTS "severity",
      DROP COLUMN IF EXISTS "probability"
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
      DROP COLUMN IF EXISTS "control_evidence",
      DROP COLUMN IF EXISTS "control_description",
      DROP COLUMN IF EXISTS "evidence_document",
      DROP COLUMN IF EXISTS "evidence_photo",
      DROP COLUMN IF EXISTS "residual_risk",
      DROP COLUMN IF EXISTS "initial_risk",
      DROP COLUMN IF EXISTS "exposure",
      DROP COLUMN IF EXISTS "severity",
      DROP COLUMN IF EXISTS "probability"
    `);

    await queryRunner.query(`
      ALTER TABLE "risks"
      DROP COLUMN IF EXISTS "control_evidence",
      DROP COLUMN IF EXISTS "control_description",
      DROP COLUMN IF EXISTS "evidence_document",
      DROP COLUMN IF EXISTS "evidence_photo",
      DROP COLUMN IF EXISTS "control_hierarchy",
      DROP COLUMN IF EXISTS "residual_risk",
      DROP COLUMN IF EXISTS "initial_risk",
      DROP COLUMN IF EXISTS "exposure",
      DROP COLUMN IF EXISTS "severity",
      DROP COLUMN IF EXISTS "probability"
    `);

    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      DROP COLUMN IF EXISTS "created_at",
      DROP COLUMN IF EXISTS "after",
      DROP COLUMN IF EXISTS "before",
      DROP COLUMN IF EXISTS "entity_id",
      DROP COLUMN IF EXISTS "entity_type",
      DROP COLUMN IF EXISTS "user_id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
