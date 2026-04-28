import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantTstUsersAndSitesManagement1709000000170 implements MigrationInterface {
  name = 'GrantTstUsersAndSitesManagement1709000000170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tstRoleNames = `
      'Técnico de Segurança do Trabalho (TST)',
      'TST',
      'Técnico',
      'Tecnico',
      'Técnico SST',
      'Tecnico SST',
      'Técnico de Segurança do Trabalho',
      'Tecnico de Seguranca do Trabalho'
    `;

    const tstPermissions = `
      'can_view_users',
      'can_manage_users',
      'can_view_sites',
      'can_manage_sites'
    `;

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_users', 'Permite visualizar usuários'),
        ('can_manage_users', 'Permite criar e gerenciar usuários'),
        ('can_view_sites', 'Permite visualizar obras/setores'),
        ('can_manage_sites', 'Permite gerenciar obras/setores')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN (${tstRoleNames})
        AND p.name IN (${tstPermissions})
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE profiles
      SET permissoes = (
        SELECT jsonb_agg(permission_name ORDER BY permission_name)
        FROM (
          SELECT DISTINCT permission_name
          FROM (
            SELECT value #>> '{}' AS permission_name
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(COALESCE(profiles.permissoes, '[]'::jsonb)) = 'array'
                  THEN COALESCE(profiles.permissoes, '[]'::jsonb)
                ELSE '[]'::jsonb
              END
            ) value
            UNION ALL
            SELECT unnest(ARRAY[
              'can_view_users',
              'can_manage_users',
              'can_view_sites',
              'can_manage_sites'
            ])
          ) merged_permissions
          WHERE permission_name IS NOT NULL
            AND permission_name <> ''
        ) deduped_permissions
      )
      WHERE nome IN (${tstRoleNames})
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: estas permissões podem ter sido concedidas por migrations antigas.
    // Removê-las em rollback poderia retirar acesso operacional legítimo do TST.
  }
}
