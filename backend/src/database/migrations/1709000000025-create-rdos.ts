import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRdos1709000000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rdos" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "numero" varchar NOT NULL,
        "data" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'rascunho',
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "responsavel_id" uuid NULL,
        "clima_manha" varchar NULL,
        "clima_tarde" varchar NULL,
        "temperatura_min" decimal(5,1) NULL,
        "temperatura_max" decimal(5,1) NULL,
        "condicao_terreno" varchar NULL,
        "mao_de_obra" json NULL,
        "equipamentos" json NULL,
        "materiais_recebidos" json NULL,
        "servicos_executados" json NULL,
        "ocorrencias" json NULL,
        "houve_acidente" boolean NOT NULL DEFAULT false,
        "houve_paralisacao" boolean NOT NULL DEFAULT false,
        "motivo_paralisacao" text NULL,
        "observacoes" text NULL,
        "programa_servicos_amanha" text NULL,
        "assinatura_responsavel" text NULL,
        "assinatura_engenheiro" text NULL,
        "pdf_file_key" varchar NULL,
        "pdf_folder_path" varchar NULL,
        "pdf_original_name" varchar NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_rdos_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_rdos_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_rdos_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rdos_company_id"
        ON "rdos" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rdos_company_data"
        ON "rdos" ("company_id", "data" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rdos_company_status"
        ON "rdos" ("company_id", "status")
    `);

    // RLS
    await queryRunner.query(`ALTER TABLE "rdos" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "rdos"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "rdos"
        USING (company_id = current_company() OR is_super_admin() = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rdos"`);
  }
}
