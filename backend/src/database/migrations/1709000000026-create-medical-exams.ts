import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMedicalExams1709000000026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "medical_exams" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tipo_exame" varchar NOT NULL,
        "resultado" varchar NOT NULL,
        "data_realizacao" date NOT NULL,
        "data_vencimento" date NULL,
        "medico_responsavel" varchar NULL,
        "crm_medico" varchar NULL,
        "observacoes" text NULL,
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_medical_exams_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_medical_exams_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_medical_exams_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_medical_exams_company_id"
        ON "medical_exams" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_medical_exams_company_vencimento"
        ON "medical_exams" ("company_id", "data_vencimento" ASC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_medical_exams_company_user"
        ON "medical_exams" ("company_id", "user_id")
    `);

    // RLS
    await queryRunner.query(`ALTER TABLE "medical_exams" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "medical_exams"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "medical_exams"
        USING (company_id = current_company() OR is_super_admin() = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medical_exams"`);
  }
}
