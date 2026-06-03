import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignTstAdminEmpresaRbac1709000000084 implements MigrationInterface {
  name = 'AlignTstAdminEmpresaRbac1709000000084';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Garante que o TST receba todas as permissões do Admin da Empresa.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT tst.id, rp_admin.permission_id
      FROM roles tst
      JOIN role_permissions rp_admin
        ON TRUE
      JOIN roles adm
        ON adm.id = rp_admin.role_id
      WHERE tst.name IN ('Técnico de Segurança do Trabalho (TST)', 'TST')
        AND adm.name IN ('Administrador da Empresa', 'ADMIN_EMPRESA')
      ON CONFLICT DO NOTHING
    `);

    // 2) Remove permissões extras do TST para manter equivalência exata.
    await queryRunner.query(`
      DELETE FROM role_permissions rp_tst
      USING roles tst
      WHERE rp_tst.role_id = tst.id
        AND tst.name IN ('Técnico de Segurança do Trabalho (TST)', 'TST')
        AND EXISTS (
          SELECT 1
          FROM role_permissions rp_admin
          JOIN roles adm
            ON adm.id = rp_admin.role_id
          WHERE adm.name IN ('Administrador da Empresa', 'ADMIN_EMPRESA')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM role_permissions rp_admin
          JOIN roles adm
            ON adm.id = rp_admin.role_id
          WHERE adm.name IN ('Administrador da Empresa', 'ADMIN_EMPRESA')
            AND rp_admin.permission_id = rp_tst.permission_id
        )
    `);
  }

  public async down(): Promise<void> {
    // No-op intencional:
    // esta migration força equivalência operacional TST = Admin da Empresa.
    // rollback automático poderia reintroduzir divergência de acesso.
  }
}
