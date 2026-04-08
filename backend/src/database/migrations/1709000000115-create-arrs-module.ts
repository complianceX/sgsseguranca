import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArrsModule1709000000115 implements MigrationInterface {
  name = 'CreateArrsModule1709000000115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arrs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "titulo" varchar(255) NOT NULL,
        "descricao" text NULL,
        "data" date NOT NULL,
        "turno" varchar(30) NULL,
        "frente_trabalho" varchar(255) NULL,
        "atividade_principal" varchar(255) NOT NULL,
        "condicao_observada" text NOT NULL,
        "risco_identificado" text NOT NULL,
        "nivel_risco" varchar(20) NOT NULL,
        "probabilidade" varchar(20) NOT NULL,
        "severidade" varchar(20) NOT NULL,
        "controles_imediatos" text NOT NULL,
        "acao_recomendada" text NULL,
        "epi_epc_aplicaveis" text NULL,
        "observacoes" text NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "responsavel_id" uuid NOT NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "status" varchar(32) NOT NULL DEFAULT 'rascunho',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_arrs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_arrs_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_arrs_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_arrs_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id"),
        CONSTRAINT "chk_arrs_status" CHECK ("status" IN ('rascunho', 'analisada', 'tratada', 'arquivada'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arr_participants" (
        "arr_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_arr_participants" PRIMARY KEY ("arr_id", "user_id"),
        CONSTRAINT "FK_arr_participants_arr_id" FOREIGN KEY ("arr_id") REFERENCES "arrs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_arr_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arrs_company_created"
      ON "arrs" ("company_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arrs_status"
      ON "arrs" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arrs_deleted_at"
      ON "arrs" ("deleted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arrs_company_site"
      ON "arrs" ("company_id", "site_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arrs_company_status_created"
      ON "arrs" ("company_id", "status", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_arrs', 'Permite visualizar Análises de Risco Rápida e PDF governado'),
        ('can_manage_arrs', 'Permite criar, atualizar, emitir PDF e excluir Análises de Risco Rápida')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN (
        'Administrador Geral',
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)',
        'Supervisor / Encarregado',
        'Operador / Colaborador'
      )
        AND p.name IN ('can_view_arrs', 'can_manage_arrs')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Trabalhador'
        AND p.name = 'can_view_arrs'
      ON CONFLICT DO NOTHING
    `);

    if (await queryRunner.hasTable('arrs')) {
      await queryRunner.query(
        `ALTER TABLE "arrs" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "arrs" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "arrs"`,
      );
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "arrs"
        USING (
          company_id = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          company_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }

    if (await queryRunner.hasTable('arr_participants')) {
      await queryRunner.query(
        `ALTER TABLE "arr_participants" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "arr_participants" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "arr_participants"`,
      );
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "arr_participants"
        USING (
          EXISTS (
            SELECT 1 FROM arrs a
            WHERE a.id = arr_id
              AND (
                a.company_id = current_company()
                OR is_super_admin() = true
              )
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM arrs a
            WHERE a.id = arr_id
              AND (
                a.company_id = current_company()
                OR is_super_admin() = true
              )
          )
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('arr_participants')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "arr_participants"`,
      );
      await queryRunner.query(
        `ALTER TABLE "arr_participants" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "arr_participants" DISABLE ROW LEVEL SECURITY`,
      );
    }

    if (await queryRunner.hasTable('arrs')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "arrs"`,
      );
      await queryRunner.query(
        `ALTER TABLE "arrs" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "arrs" DISABLE ROW LEVEL SECURITY`,
      );
    }

    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN ('can_view_arrs', 'can_manage_arrs')
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN ('can_view_arrs', 'can_manage_arrs')
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arrs_company_status_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arrs_company_site"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arrs_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arrs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arrs_company_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arr_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arrs"`);
  }
}
