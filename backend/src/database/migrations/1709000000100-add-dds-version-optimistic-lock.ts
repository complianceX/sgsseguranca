import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDdsVersionOptimisticLock1709000000100 implements MigrationInterface {
  name = 'AddDdsVersionOptimisticLock1709000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Coluna de versão para controle de concorrência otimista no TypeORM.
    // Incrementada automaticamente a cada save() pelo ORM.
    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP COLUMN IF EXISTS "version";
    `);
  }
}
