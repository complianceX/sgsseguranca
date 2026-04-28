import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantCompanyAdminProfileRead1709000000168 implements MigrationInterface {
  name = 'GrantCompanyAdminProfileRead1709000000168';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES ('can_view_profiles', 'Visualizar perfis de acesso')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p
        ON p.name = 'can_view_profiles'
      WHERE r.name IN (
        'Administrador da Empresa',
        'ADMIN_EMPRESA',
        'Técnico de Segurança do Trabalho (TST)',
        'TST'
      )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(): Promise<void> {
    // No-op intencional: remover esta permissão quebraria o fluxo de cadastro
    // de usuários/funcionários para perfis tenant-scoped.
  }
}
