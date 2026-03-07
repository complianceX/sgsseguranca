import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacOperations1709000000035
  implements MigrationInterface
{
  name = 'ExpandRbacOperations1709000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_audits', 'Permite visualizar auditorias e arquivos relacionados'),
        ('can_manage_audits', 'Permite criar, editar e excluir auditorias'),
        ('can_view_inspections', 'Permite visualizar inspecoes'),
        ('can_manage_inspections', 'Permite criar, editar e excluir inspecoes'),
        ('can_view_medical_exams', 'Permite visualizar exames medicos e exportacoes'),
        ('can_manage_medical_exams', 'Permite criar, editar e excluir exames medicos'),
        ('can_view_service_orders', 'Permite visualizar ordens de servico e exportacoes'),
        ('can_manage_service_orders', 'Permite criar, editar e excluir ordens de servico')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST')
        AND p.name IN (
          'can_view_audits',
          'can_manage_audits',
          'can_view_inspections',
          'can_manage_inspections',
          'can_view_medical_exams',
          'can_manage_medical_exams',
          'can_view_service_orders',
          'can_manage_service_orders'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'SUPERVISOR'
        AND p.name IN (
          'can_view_audits',
          'can_manage_audits',
          'can_view_inspections',
          'can_manage_inspections',
          'can_view_service_orders',
          'can_manage_service_orders'
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
          'can_view_audits',
          'can_manage_audits',
          'can_view_inspections',
          'can_manage_inspections',
          'can_view_medical_exams',
          'can_manage_medical_exams',
          'can_view_service_orders',
          'can_manage_service_orders'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_audits',
        'can_manage_audits',
        'can_view_inspections',
        'can_manage_inspections',
        'can_view_medical_exams',
        'can_manage_medical_exams',
        'can_view_service_orders',
        'can_manage_service_orders'
      )
    `);
  }
}
