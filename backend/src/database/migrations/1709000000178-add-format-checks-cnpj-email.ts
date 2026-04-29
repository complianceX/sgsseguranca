import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormatChecksCnpjEmail1709000000178 implements MigrationInterface {
  name = 'AddFormatChecksCnpjEmail1709000000178';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('companies')) {
      const exists = await this.hasConstraint(
        queryRunner,
        'companies',
        'chk_companies_cnpj_format',
      );

      if (!exists) {
        await queryRunner.query(`
          ALTER TABLE "companies"
          ADD CONSTRAINT "chk_companies_cnpj_format"
          CHECK (cnpj ~ '^[0-9]{14}$') NOT VALID
        `);
        await queryRunner.query(`
          ALTER TABLE "companies"
          VALIDATE CONSTRAINT "chk_companies_cnpj_format"
        `);
      }
    }

    if (await queryRunner.hasTable('users')) {
      const exists = await this.hasConstraint(
        queryRunner,
        'users',
        'chk_users_email_format',
      );

      if (!exists) {
        await queryRunner.query(`
          ALTER TABLE "users"
          ADD CONSTRAINT "chk_users_email_format"
          CHECK (email IS NULL OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$') NOT VALID
        `);
        await queryRunner.query(`
          ALTER TABLE "users"
          VALIDATE CONSTRAINT "chk_users_email_format"
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "chk_users_email_format"
      `);
    }

    if (await queryRunner.hasTable('companies')) {
      await queryRunner.query(`
        ALTER TABLE "companies"
        DROP CONSTRAINT IF EXISTS "chk_companies_cnpj_format"
      `);
    }
  }

  private async hasConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
          FROM pg_constraint k
          JOIN pg_class c ON c.oid = k.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname = $1
           AND k.conname = $2
         LIMIT 1
      `,
      [tableName, constraintName],
    )) as Array<unknown>;

    return rows.length > 0;
  }
}
