import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class SignaturesDataS3Key1709000000119 implements MigrationInterface {
  name = 'SignaturesDataS3Key1709000000119';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('signatures');
    if (!hasTable) {
      return;
    }

    const hasKeyCol = await queryRunner.hasColumn(
      'signatures',
      'signature_data_key',
    );
    if (!hasKeyCol) {
      await queryRunner.addColumn(
        'signatures',
        new TableColumn({
          name: 'signature_data_key',
          type: 'varchar',
          length: '512',
          isNullable: true,
          default: null,
        }),
      );
    }

    // Allow signature_data to be null (previously NOT NULL)
    await queryRunner.query(`
      ALTER TABLE "signatures"
        ALTER COLUMN "signature_data" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore NOT NULL constraint (will fail if any rows have null signature_data)
    await queryRunner.query(`
      ALTER TABLE "signatures"
        ALTER COLUMN "signature_data" SET NOT NULL
    `);

    const hasKeyCol = await queryRunner.hasColumn(
      'signatures',
      'signature_data_key',
    );
    if (hasKeyCol) {
      await queryRunner.dropColumn('signatures', 'signature_data_key');
    }
  }
}
