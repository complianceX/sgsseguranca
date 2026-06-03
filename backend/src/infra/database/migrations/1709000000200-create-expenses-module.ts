import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpensesModule1709000000200 implements MigrationInterface {
  name = 'CreateExpensesModule1709000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'aberta',
        "notes" text NULL,
        "total_advances" numeric(12,2) NOT NULL DEFAULT 0,
        "total_expenses" numeric(12,2) NOT NULL DEFAULT 0,
        "balance" numeric(12,2) NOT NULL DEFAULT 0,
        "totals_by_category" jsonb NULL,
        "closed_at" TIMESTAMP NULL,
        "closed_by_id" uuid NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "responsible_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_expense_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_reports_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_expense_reports_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_expense_reports_responsible_id" FOREIGN KEY ("responsible_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_expense_reports_closed_by_id" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id"),
        CONSTRAINT "CHK_expense_reports_status" CHECK ("status" IN ('aberta', 'fechada', 'cancelada')),
        CONSTRAINT "CHK_expense_reports_period" CHECK ("period_start" <= "period_end")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_advances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "report_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "advance_date" date NOT NULL,
        "method" varchar(32) NOT NULL,
        "description" text NULL,
        "created_by_id" uuid NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_expense_advances_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_advances_report_id" FOREIGN KEY ("report_id") REFERENCES "expense_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_advances_created_by_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
        CONSTRAINT "CHK_expense_advances_amount" CHECK ("amount" > 0),
        CONSTRAINT "CHK_expense_advances_method" CHECK ("method" IN ('pix', 'transferencia', 'dinheiro', 'cartao', 'outro'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_items" (
        "id" uuid NOT NULL,
        "report_id" uuid NOT NULL,
        "category" varchar(32) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "expense_date" date NOT NULL,
        "description" text NOT NULL,
        "vendor" varchar(160) NULL,
        "location" varchar(160) NULL,
        "receipt_file_key" text NOT NULL,
        "receipt_original_name" text NOT NULL,
        "receipt_mime_type" varchar(120) NOT NULL,
        "created_by_id" uuid NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL,
        CONSTRAINT "PK_expense_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_items_report_id" FOREIGN KEY ("report_id") REFERENCES "expense_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_items_created_by_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
        CONSTRAINT "CHK_expense_items_amount" CHECK ("amount" > 0),
        CONSTRAINT "CHK_expense_items_category" CHECK ("category" IN ('transporte', 'alimentacao', 'hospedagem', 'combustivel', 'pedagio', 'impressao', 'materiais', 'outros'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_reports_company_site_status_period"
      ON "expense_reports" ("company_id", "site_id", "status", "period_start", "period_end")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_reports_company_created"
      ON "expense_reports" ("company_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_advances_report_date"
      ON "expense_advances" ("report_id", "advance_date")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_items_report_date"
      ON "expense_items" ("report_id", "expense_date")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_items_report_category"
      ON "expense_items" ("report_id", "category")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_expenses', 'Permite visualizar prestações de despesas por obra'),
        ('can_manage_expenses', 'Permite criar prestações, adiantamentos e despesas por obra'),
        ('can_close_expenses', 'Permite fechar prestações de despesas por obra')
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
        'Supervisor / Encarregado'
      )
        AND p.name IN ('can_view_expenses', 'can_manage_expenses')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('Administrador Geral', 'Administrador da Empresa')
        AND p.name = 'can_close_expenses'
      ON CONFLICT DO NOTHING
    `);

    for (const tableName of [
      'expense_reports',
      'expense_advances',
      'expense_items',
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
      ON "expense_reports"
      FOR ALL
      USING (company_id = current_company() OR is_super_admin() = true)
      WITH CHECK (company_id = current_company() OR is_super_admin() = true)
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "expense_advances"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM expense_reports er
          WHERE er.id = expense_advances.report_id
            AND (er.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM expense_reports er
          WHERE er.id = expense_advances.report_id
            AND (er.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "expense_items"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM expense_reports er
          WHERE er.id = expense_items.report_id
            AND (er.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM expense_reports er
          WHERE er.id = expense_items.report_id
            AND (er.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);

    if (await this.roleExists(queryRunner, 'sgs_app')) {
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "expense_reports", "expense_advances", "expense_items" TO sgs_app`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'expense_items',
      'expense_advances',
      'expense_reports',
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
        WHERE name IN ('can_view_expenses', 'can_manage_expenses', 'can_close_expenses')
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN ('can_view_expenses', 'can_manage_expenses', 'can_close_expenses')
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_items_report_category"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_items_report_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_advances_report_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_reports_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_reports_company_site_status_period"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_advances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_reports"`);
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
