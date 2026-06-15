import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona índices compostos para queries de vencimento em trainings e medical_exams.
 *
 * Sem esses índices, queries de dashboard e workers de notificação (expiry-notifications)
 * fazem sequential scan em tabelas com potencialmente milhares de registros por empresa.
 *
 * Usa CONCURRENTLY para não bloquear escritas em produção.
 */
export class AddVencimentoIndexes1709000000185 implements MigrationInterface {
  name = 'AddVencimentoIndexes1709000000185';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const trainingsExists = await queryRunner.hasTable('trainings');
    if (trainingsExists) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trainings_company_vencimento"
        ON "trainings" ("company_id", "data_vencimento")
        WHERE "deleted_at" IS NULL
      `);
    }

    const medicalExamsExists = await queryRunner.hasTable('medical_exams');
    if (medicalExamsExists) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_medical_exams_company_vencimento"
        ON "medical_exams" ("company_id", "data_vencimento")
        WHERE "data_vencimento" IS NOT NULL AND "deleted_at" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_medical_exams_company_vencimento"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_trainings_company_vencimento"`,
    );
  }
}
