import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class DocumentImportStagingS3Key1709000000118 implements MigrationInterface {
  name = 'DocumentImportStagingS3Key1709000000118';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('document_imports');
    if (!hasTable) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn(
      'document_imports',
      'arquivo_staging_key',
    );
    if (!hasColumn) {
      await queryRunner.addColumn(
        'document_imports',
        new TableColumn({
          name: 'arquivo_staging_key',
          type: 'varchar',
          length: '512',
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'document_imports',
      'arquivo_staging_key',
    );
    if (hasColumn) {
      await queryRunner.dropColumn('document_imports', 'arquivo_staging_key');
    }
  }
}
