import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarViewPermission1709000000142 implements MigrationInterface {
  name = 'AddCalendarViewPermission1709000000142';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES ('can_view_calendar', 'Permite visualizar agenda operacional consolidada')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN (
        'Administrador Geral',
        'Administrador da Empresa',
        'Técnico de Segurança do Trabalho (TST)'
      )
        AND p.name = 'can_view_calendar'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE name = 'can_view_calendar'
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name = 'can_view_calendar'
    `);
  }
}
