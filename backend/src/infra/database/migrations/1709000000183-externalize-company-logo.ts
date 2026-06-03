import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ExternalizeCompanyLogo1709000000183 implements MigrationInterface {
  name = 'ExternalizeCompanyLogo1709000000183';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('companies');
    if (!table) {
      return;
    }

    if (!table.findColumnByName('logo_storage_key')) {
      await queryRunner.addColumn(
        'companies',
        new TableColumn({
          name: 'logo_storage_key',
          type: 'varchar',
          length: '512',
          isNullable: true,
        }),
      );
    }

    if (!table.findColumnByName('logo_content_type')) {
      await queryRunner.addColumn(
        'companies',
        new TableColumn({
          name: 'logo_content_type',
          type: 'varchar',
          length: '128',
          isNullable: true,
        }),
      );
    }

    if (!table.findColumnByName('logo_sha256')) {
      await queryRunner.addColumn(
        'companies',
        new TableColumn({
          name: 'logo_sha256',
          type: 'varchar',
          length: '64',
          isNullable: true,
        }),
      );
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_companies_logo_storage_key"
      ON "companies" ("logo_storage_key")
      WHERE "logo_storage_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_companies_logo_storage_key"`,
    );
    const table = await queryRunner.getTable('companies');
    if (!table) {
      return;
    }

    if (table.findColumnByName('logo_sha256')) {
      await queryRunner.dropColumn('companies', 'logo_sha256');
    }
    if (table.findColumnByName('logo_content_type')) {
      await queryRunner.dropColumn('companies', 'logo_content_type');
    }
    if (table.findColumnByName('logo_storage_key')) {
      await queryRunner.dropColumn('companies', 'logo_storage_key');
    }
  }
}
