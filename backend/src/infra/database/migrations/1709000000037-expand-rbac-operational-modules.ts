import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacOperationalModules1709000000037 implements MigrationInterface {
  name = 'ExpandRbacOperationalModules1709000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_cats', 'Permite visualizar CATs, anexos e indicadores'),
        ('can_manage_cats', 'Permite criar, atualizar e encerrar CATs'),
        ('can_view_activities', 'Permite visualizar atividades'),
        ('can_manage_activities', 'Permite criar, atualizar e excluir atividades'),
        ('can_view_corrective_actions', 'Permite visualizar acoes corretivas e indicadores SLA'),
        ('can_manage_corrective_actions', 'Permite criar, atualizar e excluir acoes corretivas'),
        ('can_view_dds', 'Permite visualizar DDS e arquivos relacionados'),
        ('can_manage_dds', 'Permite criar, atualizar e excluir DDS'),
        ('can_view_trainings', 'Permite visualizar treinamentos, compliance e exportacoes'),
        ('can_manage_trainings', 'Permite criar, atualizar, notificar e excluir treinamentos'),
        ('can_view_rdos', 'Permite visualizar RDOs e exportacoes'),
        ('can_manage_rdos', 'Permite criar, atualizar e excluir RDOs'),
        ('can_view_epi_assignments', 'Permite visualizar fichas de EPI e resumos'),
        ('can_manage_epi_assignments', 'Permite criar, atualizar, devolver e substituir fichas de EPI')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST')
        AND p.name IN (
          'can_view_cats',
          'can_manage_cats',
          'can_view_activities',
          'can_manage_activities',
          'can_view_corrective_actions',
          'can_manage_corrective_actions',
          'can_view_dds',
          'can_manage_dds',
          'can_view_trainings',
          'can_manage_trainings',
          'can_view_rdos',
          'can_manage_rdos',
          'can_view_epi_assignments',
          'can_manage_epi_assignments'
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
          'can_view_cats',
          'can_manage_cats',
          'can_view_corrective_actions',
          'can_manage_corrective_actions',
          'can_view_dds',
          'can_manage_dds',
          'can_view_rdos',
          'can_manage_rdos',
          'can_view_epi_assignments',
          'can_manage_epi_assignments'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'COLABORADOR'
        AND p.name IN (
          'can_view_dds',
          'can_manage_dds',
          'can_view_rdos',
          'can_manage_rdos',
          'can_view_epi_assignments',
          'can_manage_epi_assignments'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'TRABALHADOR'
        AND p.name IN ('can_view_dds')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name IN (
          'can_view_cats',
          'can_manage_cats',
          'can_view_activities',
          'can_manage_activities',
          'can_view_corrective_actions',
          'can_manage_corrective_actions',
          'can_view_dds',
          'can_manage_dds',
          'can_view_trainings',
          'can_manage_trainings',
          'can_view_rdos',
          'can_manage_rdos',
          'can_view_epi_assignments',
          'can_manage_epi_assignments'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_cats',
        'can_manage_cats',
        'can_view_activities',
        'can_manage_activities',
        'can_view_corrective_actions',
        'can_manage_corrective_actions',
        'can_view_dds',
        'can_manage_dds',
        'can_view_trainings',
        'can_manage_trainings',
        'can_view_rdos',
        'can_manage_rdos',
        'can_view_epi_assignments',
        'can_manage_epi_assignments'
      )
    `);
  }
}
