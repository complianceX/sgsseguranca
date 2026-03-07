import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacAdminAndAi1709000000038
  implements MigrationInterface
{
  name = 'ExpandRbacAdminAndAi1709000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_users', 'Permite visualizar usuarios'),
        ('can_manage_users', 'Permite criar, atualizar e remover usuarios'),
        ('can_view_companies', 'Permite visualizar empresas'),
        ('can_manage_companies', 'Permite criar, atualizar e remover empresas'),
        ('can_view_profiles', 'Permite visualizar perfis de acesso'),
        ('can_manage_profiles', 'Permite criar, atualizar e remover perfis de acesso'),
        ('can_view_notifications', 'Permite visualizar notificacoes proprias'),
        ('can_manage_notifications', 'Permite marcar notificacoes como lidas'),
        ('can_use_ai', 'Permite usar recursos de IA e agente SST'),
        ('can_view_system_health', 'Permite visualizar health checks do sistema')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'ADMIN_GERAL'
        AND p.name IN (
          'can_view_users',
          'can_manage_users',
          'can_view_companies',
          'can_manage_companies',
          'can_view_profiles',
          'can_manage_profiles',
          'can_view_notifications',
          'can_manage_notifications',
          'can_use_ai',
          'can_view_system_health'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_EMPRESA', 'TST')
        AND p.name IN (
          'can_view_users',
          'can_manage_users',
          'can_view_notifications',
          'can_manage_notifications',
          'can_use_ai'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'ADMIN_EMPRESA'
        AND p.name IN ('can_view_companies')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('SUPERVISOR', 'COLABORADOR', 'TRABALHADOR')
        AND p.name IN (
          'can_view_notifications',
          'can_manage_notifications'
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN (
          'can_view_users',
          'can_manage_users',
          'can_view_companies',
          'can_manage_companies',
          'can_view_profiles',
          'can_manage_profiles',
          'can_view_notifications',
          'can_manage_notifications',
          'can_use_ai',
          'can_view_system_health'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_users',
        'can_manage_users',
        'can_view_companies',
        'can_manage_companies',
        'can_view_profiles',
        'can_manage_profiles',
        'can_view_notifications',
        'can_manage_notifications',
        'can_use_ai',
        'can_view_system_health'
      )
    `);
  }
}
