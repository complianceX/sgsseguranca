import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingCheckConstraints1709000000310 implements MigrationInterface {
  name = 'AddMissingCheckConstraints1709000000310';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_nonconformities_status'
        ) THEN
          ALTER TABLE "nonconformities"
            ADD CONSTRAINT "CHK_nonconformities_status"
            CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO', 'ENCERRADA'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_service_orders_status'
        ) THEN
          ALTER TABLE "service_orders"
            ADD CONSTRAINT "CHK_service_orders_status"
            CHECK (status IN ('ativo', 'concluido', 'cancelado'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_mail_logs_status'
        ) THEN
          ALTER TABLE "mail_logs"
            ADD CONSTRAINT "CHK_mail_logs_status"
            CHECK (status IN ('sent', 'failed', 'pending', 'queued'));
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nonconformities" DROP CONSTRAINT IF EXISTS "CHK_nonconformities_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT IF EXISTS "CHK_service_orders_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_logs" DROP CONSTRAINT IF EXISTS "CHK_mail_logs_status"`,
    );
  }
}
