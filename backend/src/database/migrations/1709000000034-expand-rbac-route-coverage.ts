import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacRouteCoverage1709000000034
  implements MigrationInterface
{
  name = 'ExpandRbacRouteCoverage1709000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "description")
      VALUES
        ('can_edit_risks', 'Permite criar, editar e excluir riscos'),
        ('can_view_apr', 'Permite visualizar APRs, arquivos e exportacoes'),
        ('can_view_pt', 'Permite visualizar PTs, arquivos e exportacoes'),
        ('can_manage_pt', 'Permite criar, editar e excluir PTs'),
        ('can_view_checklists', 'Permite visualizar checklists e arquivos relacionados'),
        ('can_manage_checklists', 'Permite criar, editar e enviar checklists'),
        ('can_manage_catalogs', 'Permite acessar catalogos operacionais do tenant')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN (
        'can_edit_risks',
        'can_view_apr',
        'can_view_pt',
        'can_manage_pt',
        'can_view_checklists',
        'can_manage_checklists',
        'can_manage_catalogs'
      )
      WHERE r.name IN (
        'Administrador Geral',
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN (
        'can_view_apr',
        'can_view_pt',
        'can_manage_pt',
        'can_view_checklists',
        'can_manage_checklists',
        'can_manage_catalogs'
      )
      WHERE r.name = 'Supervisor / Encarregado'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p ON p.name IN (
        'can_view_apr',
        'can_view_pt',
        'can_manage_pt'
      )
      WHERE r.name = 'Operador / Colaborador'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT id
        FROM permissions
        WHERE name IN (
          'can_edit_risks',
          'can_view_apr',
          'can_view_pt',
          'can_manage_pt',
          'can_view_checklists',
          'can_manage_checklists',
          'can_manage_catalogs'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE name IN (
        'can_edit_risks',
        'can_view_apr',
        'can_view_pt',
        'can_manage_pt',
        'can_view_checklists',
        'can_manage_checklists',
        'can_manage_catalogs'
      )
    `);
  }
}
