import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitAprCriticalPermissions1709000000194 implements MigrationInterface {
  name = 'SplitAprCriticalPermissions1709000000194';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const adminGeralProfiles = `
      'Administrador Geral',
      'ADMIN_GERAL'
    `;
    const aprOperatorProfiles = `
      'Administrador da Empresa',
      'ADMIN_EMPRESA',
      'Técnico de Segurança do Trabalho (TST)',
      'TST',
      'Técnico',
      'Tecnico',
      'Técnico SST',
      'Tecnico SST',
      'Técnico de Segurança do Trabalho',
      'Tecnico de Seguranca do Trabalho',
      'Supervisor / Encarregado',
      'SUPERVISOR',
      'Supervisor'
    `;
    const colaboradorProfiles = `
      'Operador / Colaborador',
      'COLABORADOR',
      'Colaborador',
      'Operador'
    `;

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_update_apr',       'Permite editar APRs pendentes e criar novas versões'),
        ('can_approve_apr',      'Permite aprovar APRs'),
        ('can_reject_apr',       'Permite reprovar ou cancelar APRs'),
        ('can_finalize_apr',     'Permite encerrar APRs aprovadas com PDF final oficial'),
        ('can_generate_apr_pdf', 'Permite gerar PDF final oficial de APR'),
        ('can_delete_apr',       'Permite excluir APRs pendentes'),
        ('can_import_apr_pdf',   'Permite acessar fluxo legado de importação de PDF de APR')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Administrador Geral'
        AND p.name IN (
          'can_update_apr',
          'can_approve_apr',
          'can_reject_apr',
          'can_finalize_apr',
          'can_generate_apr_pdf',
          'can_delete_apr',
          'can_import_apr_pdf'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN (
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)',
        'Supervisor / Encarregado'
      )
        AND p.name IN (
          'can_update_apr',
          'can_approve_apr',
          'can_reject_apr',
          'can_finalize_apr',
          'can_generate_apr_pdf',
          'can_delete_apr'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN (
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)',
        'Supervisor / Encarregado'
      )
        AND p.name = 'can_delete_apr'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Operador / Colaborador'
        AND p.name = 'can_update_apr'
      ON CONFLICT DO NOTHING
    `);

    await this.grantProfilePermissions(queryRunner, adminGeralProfiles, [
      'can_update_apr',
      'can_approve_apr',
      'can_reject_apr',
      'can_finalize_apr',
      'can_generate_apr_pdf',
      'can_delete_apr',
      'can_import_apr_pdf',
    ]);

    await this.grantProfilePermissions(queryRunner, aprOperatorProfiles, [
      'can_update_apr',
      'can_approve_apr',
      'can_reject_apr',
      'can_finalize_apr',
      'can_generate_apr_pdf',
      'can_delete_apr',
    ]);

    await this.grantProfilePermissions(queryRunner, colaboradorProfiles, [
      'can_update_apr',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const profilePermissionNames = [
      'can_update_apr',
      'can_approve_apr',
      'can_reject_apr',
      'can_finalize_apr',
      'can_generate_apr_pdf',
      'can_delete_apr',
      'can_import_apr_pdf',
    ];

    await queryRunner.query(
      `
        UPDATE profiles
        SET permissoes = COALESCE(
          (
            SELECT jsonb_agg(permission_name ORDER BY permission_name)
            FROM (
              SELECT DISTINCT value #>> '{}' AS permission_name
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(COALESCE(profiles.permissoes, '[]'::jsonb)) = 'array'
                    THEN COALESCE(profiles.permissoes, '[]'::jsonb)
                  ELSE '[]'::jsonb
                END
              ) value
              WHERE value #>> '{}' <> ALL($1::text[])
            ) remaining_permissions
          ),
          '[]'::jsonb
        )
        WHERE jsonb_typeof(COALESCE(permissoes, '[]'::jsonb)) = 'array'
      `,
      [profilePermissionNames],
    );

    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN (
          'can_update_apr',
          'can_approve_apr',
          'can_reject_apr',
          'can_finalize_apr',
          'can_generate_apr_pdf',
          'can_delete_apr',
          'can_import_apr_pdf'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_update_apr',
        'can_approve_apr',
        'can_reject_apr',
        'can_finalize_apr',
        'can_generate_apr_pdf',
        'can_delete_apr',
        'can_import_apr_pdf'
      )
    `);
  }

  private async grantProfilePermissions(
    queryRunner: QueryRunner,
    profileNamesSql: string,
    permissions: string[],
  ): Promise<void> {
    await queryRunner.query(
      `
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
              SELECT unnest($1::text[])
            ) merged_permissions
            WHERE permission_name IS NOT NULL
              AND permission_name <> ''
          ) deduped_permissions
        )
        WHERE nome IN (${profileNamesSql})
      `,
      [permissions],
    );
  }
}
