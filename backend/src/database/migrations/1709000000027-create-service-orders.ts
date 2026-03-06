import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceOrders1709000000027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_orders" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "numero" varchar NOT NULL,
        "titulo" varchar NOT NULL,
        "descricao_atividades" text NOT NULL,
        "riscos_identificados" json NULL,
        "epis_necessarios" json NULL,
        "responsabilidades" text NULL,
        "status" varchar NOT NULL DEFAULT 'ativo',
        "data_emissao" date NOT NULL,
        "data_inicio" date NULL,
        "data_fim_previsto" date NULL,
        "responsavel_id" uuid NULL,
        "site_id" uuid NULL,
        "company_id" uuid NOT NULL,
        "assinatura_responsavel" text NULL,
        "assinatura_colaborador" text NULL,
        "pdf_file_key" varchar NULL,
        "pdf_folder_path" varchar NULL,
        "pdf_original_name" varchar NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_service_orders_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_service_orders_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_service_orders_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_orders_company_id"
        ON "service_orders" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_orders_company_status"
        ON "service_orders" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_orders_company_emissao"
        ON "service_orders" ("company_id", "data_emissao" DESC)
    `);

    // RLS
    await queryRunner.query(`ALTER TABLE "service_orders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "service_orders"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "service_orders"
        USING (company_id = current_company() OR is_super_admin() = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_orders"`);
  }
}
