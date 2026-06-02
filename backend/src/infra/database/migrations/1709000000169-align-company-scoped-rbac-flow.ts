import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignCompanyScopedRbacFlow1709000000169 implements MigrationInterface {
  name = 'AlignCompanyScopedRbacFlow1709000000169';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const companyScopedRoles = `
      'Administrador da Empresa',
      'ADMIN_EMPRESA',
      'Técnico de Segurança do Trabalho (TST)',
      'TST',
      'Supervisor / Encarregado',
      'SUPERVISOR'
    `;
    const adminOnlyPermissions = `
      'can_manage_companies',
      'can_manage_profiles',
      'can_view_system_health',
      'can_manage_disaster_recovery'
    `;

    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.name IN (${companyScopedRoles})
        AND p.name IN (${adminOnlyPermissions})
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT target_role.id, source_permissions.permission_id
      FROM roles target_role
      CROSS JOIN LATERAL (
        SELECT DISTINCT rp.permission_id
        FROM roles source_role
        INNER JOIN role_permissions rp
          ON rp.role_id = source_role.id
        INNER JOIN permissions p
          ON p.id = rp.permission_id
        WHERE source_role.name IN ('Administrador da Empresa', 'ADMIN_EMPRESA')
          AND p.name NOT IN (${adminOnlyPermissions})
      ) source_permissions
      WHERE target_role.name IN (${companyScopedRoles})
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE profiles
      SET permissoes = COALESCE(
        (
          SELECT jsonb_agg(permission_name ORDER BY permission_name)
          FROM (
            SELECT DISTINCT value #>> '{}' AS permission_name
            FROM jsonb_array_elements(COALESCE(profiles.permissoes, '[]'::jsonb)) value
            WHERE value #>> '{}' NOT IN (${adminOnlyPermissions})
          ) cleaned_permissions
        ),
        '[]'::jsonb
      )
      WHERE nome IN (${companyScopedRoles})
        AND jsonb_typeof(COALESCE(permissoes, '[]'::jsonb)) = 'array'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.name IN (
          'Técnico de Segurança do Trabalho (TST)',
          'TST',
          'Supervisor / Encarregado',
          'SUPERVISOR'
        )
        AND p.name IN (
          SELECT p2.name
          FROM roles source_role
          INNER JOIN role_permissions source_rp
            ON source_rp.role_id = source_role.id
          INNER JOIN permissions p2
            ON p2.id = source_rp.permission_id
          WHERE source_role.name IN ('Administrador da Empresa', 'ADMIN_EMPRESA')
        )
    `);
  }
}
