import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTemplateFieldsToChecklist1708819200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar campo template_id para vincular checklist ao template
    await queryRunner.addColumn(
      'checklists',
      new TableColumn({
        name: 'template_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Adicionar índice para melhorar performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_checklists_template_id ON checklists(template_id);
      CREATE INDEX IF NOT EXISTS idx_checklists_is_modelo ON checklists(is_modelo);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_checklists_template_id;
      DROP INDEX IF EXISTS idx_checklists_is_modelo;
    `);

    await queryRunner.dropColumn('checklists', 'template_id');
  }
}
