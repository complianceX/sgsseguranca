import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenPhotographicReportsRbac1709000000205 implements MigrationInterface {
  name = 'HardenPhotographicReportsRbac1709000000205';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.name = 'Operador / Colaborador'
        AND p.name IN (
          'can_manage_photographic_reports',
          'can_generate_photographic_report_ai',
          'can_export_photographic_report_pdf',
          'can_export_photographic_report_word',
          'can_finalize_photographic_report'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p
        ON p.name IN (
          'can_manage_photographic_reports',
          'can_generate_photographic_report_ai',
          'can_export_photographic_report_pdf',
          'can_export_photographic_report_word',
          'can_finalize_photographic_report'
        )
      WHERE r.name = 'Operador / Colaborador'
      ON CONFLICT DO NOTHING
    `);
  }
}
