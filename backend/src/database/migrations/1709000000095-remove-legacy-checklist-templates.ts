import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyChecklistTemplates1709000000095
  implements MigrationInterface
{
  name = 'RemoveLegacyChecklistTemplates1709000000095';

  private readonly legacyTitles = [
    'Checklist - Trabalho em Altura',
    'Checklist - Eletricidade',
    'Checklist - Escavação',
    'Checklist - Içamento de Carga',
    'Checklist - Espaço Confinado',
    'Checklist - Máquinas e Equipamentos',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const titles = this.legacyTitles.map((title) => `'${title}'`).join(', ');

    await queryRunner.query(`
      UPDATE "checklists"
      SET
        "template_id" = NULL,
        "updated_at" = NOW()
      WHERE "template_id" IN (
        SELECT "id"
        FROM "checklists"
        WHERE "is_modelo" = true
          AND "titulo" IN (${titles})
      )
    `);

    await queryRunner.query(`
      DELETE FROM "checklists"
      WHERE "is_modelo" = true
        AND "titulo" IN (${titles})
    `);
  }

  public async down(): Promise<void> {
    // Irreversível: os registros removidos são dados de catálogo.
  }
}
