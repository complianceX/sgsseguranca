import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserCpfFuncaoNullable1709000000018 implements MigrationInterface {
  name = 'MakeUserCpfFuncaoNullable1709000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "cpf" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "funcao" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "cpf" = '00000000000' WHERE "cpf" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "users" SET "funcao" = '' WHERE "funcao" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "cpf" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "funcao" SET NOT NULL
    `);
  }
}
