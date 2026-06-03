import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacSitesAndDossiers1709000000039 implements MigrationInterface {
  name = 'ExpandRbacSitesAndDossiers1709000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_sites', 'Permite visualizar obras e frentes de trabalho'),
        ('can_manage_sites', 'Permite criar, atualizar e excluir obras'),
        ('can_view_dossiers', 'Permite gerar e visualizar dossies de colaboradores')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST')
        AND p.name IN (
          'can_view_sites',
          'can_manage_sites',
          'can_view_dossiers'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('SUPERVISOR', 'COLABORADOR', 'TRABALHADOR')
        AND p.name IN ('can_view_sites')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN (
          'can_view_sites',
          'can_manage_sites',
          'can_view_dossiers'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_sites',
        'can_manage_sites',
        'can_view_dossiers'
      )
    `);
  }
}
