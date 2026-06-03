import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDidsModule1709000000096 implements MigrationInterface {
  name = 'CreateDidsModule1709000000096';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dids" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "titulo" varchar(255) NOT NULL,
        "descricao" text NULL,
        "data" date NOT NULL,
        "turno" varchar(30) NULL,
        "frente_trabalho" varchar(255) NULL,
        "atividade_principal" varchar(255) NOT NULL,
        "atividades_planejadas" text NOT NULL,
        "riscos_operacionais" text NOT NULL,
        "controles_planejados" text NOT NULL,
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
        CONSTRAINT "PK_dids_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dids_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_dids_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_dids_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "did_participants" (
        "did_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_did_participants" PRIMARY KEY ("did_id", "user_id"),
        CONSTRAINT "FK_did_participants_did_id" FOREIGN KEY ("did_id") REFERENCES "dids"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_did_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dids_company_created"
      ON "dids" ("company_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dids_status"
      ON "dids" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dids_deleted_at"
      ON "dids" ("deleted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dids_company_site"
      ON "dids" ("company_id", "site_id")
    `);

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_dids', 'Permite visualizar Dialogos do Inicio do Dia e PDF governado'),
        ('can_manage_dids', 'Permite criar, atualizar, emitir PDF e excluir Dialogos do Inicio do Dia')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST', 'SUPERVISOR', 'COLABORADOR')
        AND p.name IN ('can_view_dids', 'can_manage_dids')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'TRABALHADOR'
        AND p.name = 'can_view_dids'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN ('can_view_dids', 'can_manage_dids')
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN ('can_view_dids', 'can_manage_dids')
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dids_company_site"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dids_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dids_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dids_company_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "did_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dids"`);
  }
}
