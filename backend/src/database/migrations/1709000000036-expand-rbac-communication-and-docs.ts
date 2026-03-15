import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandRbacCommunicationAndDocs1709000000036 implements MigrationInterface {
  name = 'ExpandRbacCommunicationAndDocs1709000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_mail', 'Permite visualizar logs e exportacoes de e-mail'),
        ('can_manage_mail', 'Permite enviar documentos e disparar alertas por e-mail'),
        ('can_view_signatures', 'Permite visualizar e verificar assinaturas'),
        ('can_manage_signatures', 'Permite criar e remover assinaturas'),
        ('can_import_documents', 'Permite importar documentos e gerar uploads assinados')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST')
        AND p.name IN (
          'can_view_mail',
          'can_manage_mail',
          'can_view_signatures',
          'can_manage_signatures',
          'can_import_documents'
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
          'can_view_signatures',
          'can_manage_signatures',
          'can_import_documents'
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('COLABORADOR', 'TRABALHADOR')
        AND p.name IN (
          'can_view_signatures',
          'can_manage_signatures'
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
          'can_view_mail',
          'can_manage_mail',
          'can_view_signatures',
          'can_manage_signatures',
          'can_import_documents'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name IN (
        'can_view_mail',
        'can_manage_mail',
        'can_view_signatures',
        'can_manage_signatures',
        'can_import_documents'
      )
    `);
  }
}
