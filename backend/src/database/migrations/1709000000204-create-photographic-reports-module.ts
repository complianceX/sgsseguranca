import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePhotographicReportsModule1709000000204 implements MigrationInterface {
  name = 'CreatePhotographicReportsModule1709000000204';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photographic_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "client_id" varchar(80) NULL,
        "project_id" varchar(80) NULL,
        "client_name" varchar(160) NOT NULL,
        "project_name" varchar(160) NOT NULL,
        "unit_name" varchar(160) NULL,
        "location" varchar(220) NULL,
        "activity_type" varchar(120) NOT NULL,
        "report_tone" varchar(24) NOT NULL DEFAULT 'Positivo',
        "area_status" varchar(24) NOT NULL DEFAULT 'Loja aberta',
        "shift" varchar(24) NOT NULL DEFAULT 'Diurno',
        "start_date" date NOT NULL,
        "end_date" date NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "responsible_name" varchar(160) NOT NULL,
        "contractor_company" varchar(180) NOT NULL,
        "general_observations" text NULL,
        "ai_summary" text NULL,
        "final_conclusion" text NULL,
        "status" varchar(32) NOT NULL DEFAULT 'Rascunho',
        "created_by" uuid NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_photographic_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_photographic_reports_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_photographic_reports_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
        CONSTRAINT "CHK_photographic_reports_report_tone" CHECK ("report_tone" IN ('Positivo', 'Técnico', 'Preventivo')),
        CONSTRAINT "CHK_photographic_reports_area_status" CHECK ("area_status" IN ('Loja aberta', 'Loja fechada', 'Área controlada', 'Área isolada')),
        CONSTRAINT "CHK_photographic_reports_shift" CHECK ("shift" IN ('Diurno', 'Noturno', 'Integral')),
        CONSTRAINT "CHK_photographic_reports_status" CHECK ("status" IN ('Rascunho', 'Aguardando fotos', 'Aguardando análise', 'Analisado', 'Em edição', 'Finalizado', 'Exportado', 'Cancelado'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photographic_report_days" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "report_id" uuid NOT NULL,
        "activity_date" date NOT NULL,
        "day_summary" text NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_photographic_report_days_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_photographic_report_days_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_photographic_report_days_report_id" FOREIGN KEY ("report_id") REFERENCES "photographic_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_photographic_report_days_report_date" UNIQUE ("report_id", "activity_date")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photographic_report_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "report_id" uuid NOT NULL,
        "report_day_id" uuid NULL,
        "image_url" text NOT NULL,
        "image_order" integer NOT NULL DEFAULT 1,
        "manual_caption" text NULL,
        "ai_title" text NULL,
        "ai_description" text NULL,
        "ai_positive_points" jsonb NULL,
        "ai_technical_assessment" text NULL,
        "ai_condition_classification" text NULL,
        "ai_recommendations" jsonb NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_photographic_report_images_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_photographic_report_images_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_photographic_report_images_report_id" FOREIGN KEY ("report_id") REFERENCES "photographic_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_photographic_report_images_report_day_id" FOREIGN KEY ("report_day_id") REFERENCES "photographic_report_days"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_photographic_report_images_report_order" UNIQUE ("report_id", "image_order")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photographic_report_exports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "report_id" uuid NOT NULL,
        "export_type" varchar(16) NOT NULL,
        "file_url" text NOT NULL,
        "generated_by" uuid NULL,
        "generated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_photographic_report_exports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_photographic_report_exports_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_photographic_report_exports_report_id" FOREIGN KEY ("report_id") REFERENCES "photographic_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_photographic_report_exports_generated_by" FOREIGN KEY ("generated_by") REFERENCES "users"("id"),
        CONSTRAINT "CHK_photographic_report_exports_type" CHECK ("export_type" IN ('word', 'pdf'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_photographic_reports_company_created"
      ON "photographic_reports" ("company_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_photographic_reports_company_status"
      ON "photographic_reports" ("company_id", "status")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_photographic_report_days_report_date"
      ON "photographic_report_days" ("report_id", "activity_date")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_photographic_report_images_report_order"
      ON "photographic_report_images" ("report_id", "image_order")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_photographic_report_exports_report_type"
      ON "photographic_report_exports" ("report_id", "export_type")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_photographic_reports', 'Permite visualizar relatórios fotográficos'),
        ('can_manage_photographic_reports', 'Permite criar, editar e organizar relatórios fotográficos'),
        ('can_generate_photographic_report_ai', 'Permite gerar descrições e sínteses com IA para relatórios fotográficos'),
        ('can_export_photographic_report_pdf', 'Permite exportar relatórios fotográficos em PDF'),
        ('can_export_photographic_report_word', 'Permite exportar relatórios fotográficos em Word'),
        ('can_finalize_photographic_report', 'Permite finalizar relatórios fotográficos')
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
        AND p.name IN (
          'can_view_photographic_reports',
          'can_manage_photographic_reports',
          'can_generate_photographic_report_ai',
          'can_export_photographic_report_pdf',
          'can_export_photographic_report_word',
          'can_finalize_photographic_report'
        )
      ON CONFLICT DO NOTHING
    `);

    for (const tableName of [
      'photographic_reports',
      'photographic_report_days',
      'photographic_report_images',
      'photographic_report_exports',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${tableName}"`,
      );
    }

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "photographic_reports"
      FOR ALL
      USING (company_id = current_company() OR is_super_admin() = true)
      WITH CHECK (company_id = current_company() OR is_super_admin() = true)
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "photographic_report_days"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_days.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_days.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "photographic_report_images"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_images.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_images.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "photographic_report_exports"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_exports.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM photographic_reports pr
          WHERE pr.id = photographic_report_exports.report_id
            AND (pr.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);

    if (await this.roleExists(queryRunner, 'sgs_app')) {
      await queryRunner.query(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON
          "photographic_reports",
          "photographic_report_days",
          "photographic_report_images",
          "photographic_report_exports"
        TO sgs_app
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'photographic_report_exports',
      'photographic_report_images',
      'photographic_report_days',
      'photographic_reports',
    ]) {
      if (await queryRunner.hasTable(tableName)) {
        await queryRunner.query(
          `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${tableName}"`,
        );
        await queryRunner.query(
          `ALTER TABLE "${tableName}" NO FORCE ROW LEVEL SECURITY`,
        );
        await queryRunner.query(
          `ALTER TABLE "${tableName}" DISABLE ROW LEVEL SECURITY`,
        );
      }
    }

    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN (
          'can_view_photographic_reports',
          'can_manage_photographic_reports',
          'can_generate_photographic_report_ai',
          'can_export_photographic_report_pdf',
          'can_export_photographic_report_word',
          'can_finalize_photographic_report'
        )
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_photographic_reports',
        'can_manage_photographic_reports',
        'can_generate_photographic_report_ai',
        'can_export_photographic_report_pdf',
        'can_export_photographic_report_word',
        'can_finalize_photographic_report'
      )
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_photographic_report_exports_report_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_photographic_report_images_report_order"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_photographic_report_days_report_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_photographic_reports_company_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_photographic_reports_company_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "photographic_report_exports"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "photographic_report_images"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "photographic_report_days"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "photographic_reports"`);
  }

  private async roleExists(
    queryRunner: QueryRunner,
    roleName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1 LIMIT 1`,
      [roleName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }
}
