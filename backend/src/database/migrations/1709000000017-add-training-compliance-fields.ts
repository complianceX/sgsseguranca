import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrainingComplianceFields1709000000017 implements MigrationInterface {
  name = 'AddTrainingComplianceFields1709000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "nr_codigo" character varying,
      ADD COLUMN IF NOT EXISTS "carga_horaria" integer,
      ADD COLUMN IF NOT EXISTS "obrigatorio_para_funcao" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "bloqueia_operacao_quando_vencido" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trainings_company_vencimento"
      ON "trainings" ("company_id", "data_vencimento")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trainings_company_user_vencimento"
      ON "trainings" ("company_id", "user_id", "data_vencimento")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_trainings_company_user_vencimento"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_trainings_company_vencimento"`,
    );
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "bloqueia_operacao_quando_vencido",
      DROP COLUMN IF EXISTS "obrigatorio_para_funcao",
      DROP COLUMN IF EXISTS "carga_horaria",
      DROP COLUMN IF EXISTS "nr_codigo"
    `);
  }
}
