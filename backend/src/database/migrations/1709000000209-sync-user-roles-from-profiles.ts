import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncUserRolesFromProfiles1709000000209
  implements MigrationInterface
{
  name = 'SyncUserRolesFromProfiles1709000000209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH profile_roles(profile_name, role_name) AS (
        VALUES
          ('Administrador Geral', 'Administrador Geral'),
          ('ADMIN_GERAL', 'Administrador Geral'),
          ('Administrador da Empresa', 'Administrador da Empresa'),
          ('ADMIN_EMPRESA', 'Administrador da Empresa'),
          ('Técnico de Segurança do Trabalho (TST)', 'Técnico de Segurança do Trabalho (TST)'),
          ('Técnico de Segurança do Trabalho', 'Técnico de Segurança do Trabalho (TST)'),
          ('Tecnico de Seguranca do Trabalho', 'Técnico de Segurança do Trabalho (TST)'),
          ('Técnico SST', 'Técnico de Segurança do Trabalho (TST)'),
          ('Tecnico SST', 'Técnico de Segurança do Trabalho (TST)'),
          ('Técnico', 'Técnico de Segurança do Trabalho (TST)'),
          ('Tecnico', 'Técnico de Segurança do Trabalho (TST)'),
          ('TST', 'Técnico de Segurança do Trabalho (TST)'),
          ('Supervisor / Encarregado', 'Supervisor / Encarregado'),
          ('Supervisor', 'Supervisor / Encarregado'),
          ('SUPERVISOR', 'Supervisor / Encarregado'),
          ('Operador / Colaborador', 'Operador / Colaborador'),
          ('COLABORADOR', 'Operador / Colaborador'),
          ('Trabalhador', 'Trabalhador'),
          ('TRABALHADOR', 'Trabalhador')
      )
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id
      FROM users u
      INNER JOIN profiles p
        ON p.id = u.profile_id
      INNER JOIN profile_roles pr
        ON pr.profile_name = p.nome
      INNER JOIN roles r
        ON r.name = pr.role_name
      WHERE u.deleted_at IS NULL
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);
  }

  public async down(): Promise<void> {
    // No-op: this is an idempotent data repair. Removing role links on rollback
    // would risk revoking valid access for existing tenants.
  }
}
