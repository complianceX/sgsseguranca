import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROBLEMA RAIZ IDENTIFICADO:
 *
 * Todas as migrations RBAC de 034 a 096 inseriram em role_permissions usando nomes
 * CURTOS ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST', 'SUPERVISOR', 'COLABORADOR', 'TRABALHADOR'),
 * mas a tabela `roles` (criada em migration 030) usa nomes COMPLETOS:
 *   - 'Administrador Geral'
 *   - 'Administrador da Empresa'
 *   - 'Técnico de Segurança do Trabalho (TST)'
 *   - 'Supervisor / Encarregado'
 *   - 'Operador / Colaborador'
 *
 * Resultado: a tabela role_permissions está praticamente VAZIA para a maioria das
 * permissões. O sistema funcionava apenas pelo fallback em código (PROFILE_PERMISSION_FALLBACK),
 * o que é frágil e não reflete o estado real esperado no banco de dados.
 *
 * CORREÇÕES DESTA MIGRATION:
 *  1. Garante que todos os roles existam na tabela `roles` (incluindo 'Trabalhador').
 *  2. Insere TODOS os role_permissions faltantes usando os nomes corretos.
 *  3. Adiciona RLS (Row Level Security) às tabelas `dids` e `did_participants`,
 *     que foram criadas em migration 096 sem proteção de isolamento de tenant.
 */
export class FixRbacRolePermissionsAndDidsRls1709000000103 implements MigrationInterface {
  name = 'FixRbacRolePermissionsAndDidsRls1709000000103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // 1. Garantir que todos os roles existam com os nomes corretos
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO roles (name, description)
      VALUES
        ('Administrador Geral',                        'Acesso administrativo global'),
        ('Administrador da Empresa',                   'Acesso administrativo por empresa'),
        ('Técnico de Segurança do Trabalho (TST)',     'Acesso técnico SST'),
        ('Supervisor / Encarregado',                   'Acesso de supervisão operacional'),
        ('Operador / Colaborador',                     'Acesso operacional limitado'),
        ('Trabalhador',                                'Acesso básico de trabalhador de campo')
      ON CONFLICT (name) DO NOTHING
    `);

    // =========================================================================
    // 2. Garantir que todas as permissions existam
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES
        ('can_view_risks',               'Permite visualizar mapa de riscos'),
        ('can_edit_risks',               'Permite editar mapa de riscos'),
        ('can_create_apr',               'Permite criar APRs'),
        ('can_view_apr',                 'Permite visualizar APRs'),
        ('can_view_pt',                  'Permite visualizar PTs'),
        ('can_manage_pt',                'Permite criar e gerenciar PTs'),
        ('can_approve_pt',               'Permite aprovar PTs'),
        ('can_manage_nc',                'Permite gerenciar não conformidades'),
        ('can_view_dashboard',           'Permite acessar o painel principal'),
        ('can_view_checklists',          'Permite visualizar checklists'),
        ('can_manage_checklists',        'Permite criar e gerenciar checklists'),
        ('can_manage_catalogs',          'Permite gerenciar catálogos'),
        ('can_view_audits',              'Permite visualizar auditorias'),
        ('can_manage_audits',            'Permite criar e gerenciar auditorias'),
        ('can_view_inspections',         'Permite visualizar inspeções'),
        ('can_manage_inspections',       'Permite criar e gerenciar inspeções'),
        ('can_view_medical_exams',       'Permite visualizar exames médicos'),
        ('can_manage_medical_exams',     'Permite gerenciar exames médicos'),
        ('can_view_service_orders',      'Permite visualizar ordens de serviço'),
        ('can_manage_service_orders',    'Permite gerenciar ordens de serviço'),
        ('can_view_mail',                'Permite visualizar comunicações'),
        ('can_manage_mail',              'Permite gerenciar comunicações'),
        ('can_view_signatures',          'Permite visualizar assinaturas'),
        ('can_manage_signatures',        'Permite gerenciar assinaturas'),
        ('can_import_documents',         'Permite importar documentos com IA'),
        ('can_view_cats',                'Permite visualizar CATs'),
        ('can_manage_cats',              'Permite criar e gerenciar CATs'),
        ('can_view_activities',          'Permite visualizar atividades'),
        ('can_manage_activities',        'Permite criar e gerenciar atividades'),
        ('can_view_corrective_actions',  'Permite visualizar ações corretivas'),
        ('can_manage_corrective_actions','Permite criar e gerenciar ações corretivas'),
        ('can_view_dds',                 'Permite visualizar DDS e arquivos relacionados'),
        ('can_manage_dds',               'Permite criar, atualizar e excluir DDS'),
        ('can_view_dids',                'Permite visualizar Dialogos do Inicio do Dia e PDF governado'),
        ('can_manage_dids',              'Permite criar, atualizar, emitir PDF e excluir Dialogos do Inicio do Dia'),
        ('can_view_trainings',           'Permite visualizar treinamentos'),
        ('can_manage_trainings',         'Permite criar e gerenciar treinamentos'),
        ('can_view_rdos',                'Permite visualizar RDOs e exportacoes'),
        ('can_manage_rdos',              'Permite criar, atualizar e excluir RDOs'),
        ('can_view_epi_assignments',     'Permite visualizar fichas de EPI'),
        ('can_manage_epi_assignments',   'Permite criar e gerenciar fichas de EPI'),
        ('can_view_users',               'Permite visualizar usuários'),
        ('can_manage_users',             'Permite criar e gerenciar usuários'),
        ('can_view_companies',           'Permite visualizar empresas'),
        ('can_manage_companies',         'Permite criar e gerenciar empresas'),
        ('can_view_profiles',            'Permite visualizar perfis'),
        ('can_manage_profiles',          'Permite criar e gerenciar perfis'),
        ('can_view_notifications',       'Permite visualizar notificações'),
        ('can_manage_notifications',     'Permite gerenciar notificações'),
        ('can_use_ai',                   'Permite usar recursos de IA'),
        ('can_view_system_health',       'Permite visualizar saúde do sistema'),
        ('can_view_sites',               'Permite visualizar obras/setores'),
        ('can_manage_sites',             'Permite gerenciar obras/setores'),
        ('can_view_dossiers',            'Permite visualizar dossiês'),
        ('can_view_documents_registry',  'Permite consultar e baixar o registry documental consolidado')
      ON CONFLICT (name) DO NOTHING
    `);

    // =========================================================================
    // 3. Atribuir permissions ao Administrador Geral (acesso total)
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Administrador Geral'
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 4. Administrador da Empresa (sem can_manage_companies, can_view_system_health)
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Administrador da Empresa'
        AND p.name IN (
          'can_view_risks', 'can_edit_risks',
          'can_create_apr', 'can_view_apr',
          'can_view_pt', 'can_manage_pt', 'can_approve_pt',
          'can_manage_nc',
          'can_view_dashboard',
          'can_view_checklists', 'can_manage_checklists',
          'can_manage_catalogs',
          'can_view_audits', 'can_manage_audits',
          'can_view_inspections', 'can_manage_inspections',
          'can_view_medical_exams', 'can_manage_medical_exams',
          'can_view_service_orders', 'can_manage_service_orders',
          'can_view_mail', 'can_manage_mail',
          'can_view_signatures', 'can_manage_signatures',
          'can_import_documents',
          'can_view_cats', 'can_manage_cats',
          'can_view_activities', 'can_manage_activities',
          'can_view_corrective_actions', 'can_manage_corrective_actions',
          'can_view_dds', 'can_manage_dds',
          'can_view_dids', 'can_manage_dids',
          'can_view_trainings', 'can_manage_trainings',
          'can_view_rdos', 'can_manage_rdos',
          'can_view_epi_assignments', 'can_manage_epi_assignments',
          'can_view_users', 'can_manage_users',
          'can_view_companies',
          'can_view_profiles', 'can_manage_profiles',
          'can_view_notifications', 'can_manage_notifications',
          'can_use_ai',
          'can_view_sites', 'can_manage_sites',
          'can_view_dossiers',
          'can_view_documents_registry'
        )
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 5. TST = mesmo conjunto do Administrador da Empresa
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT tst.id, rp.permission_id
      FROM roles tst
      JOIN roles adm ON adm.name = 'Administrador da Empresa'
      JOIN role_permissions rp ON rp.role_id = adm.id
      WHERE tst.name = 'Técnico de Segurança do Trabalho (TST)'
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 6. Supervisor / Encarregado
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Supervisor / Encarregado'
        AND p.name IN (
          'can_view_risks', 'can_create_apr', 'can_view_apr',
          'can_view_pt', 'can_manage_pt',
          'can_view_dashboard',
          'can_view_checklists', 'can_manage_checklists',
          'can_manage_catalogs',
          'can_view_audits', 'can_manage_audits',
          'can_view_inspections', 'can_manage_inspections',
          'can_view_service_orders', 'can_manage_service_orders',
          'can_view_mail', 'can_manage_mail',
          'can_view_signatures', 'can_manage_signatures',
          'can_import_documents',
          'can_view_cats', 'can_manage_cats',
          'can_view_corrective_actions', 'can_manage_corrective_actions',
          'can_view_dds', 'can_manage_dds',
          'can_view_dids', 'can_manage_dids',
          'can_view_rdos', 'can_manage_rdos',
          'can_view_epi_assignments', 'can_manage_epi_assignments',
          'can_view_notifications', 'can_manage_notifications',
          'can_view_sites',
          'can_view_documents_registry'
        )
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 7. Operador / Colaborador
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Operador / Colaborador'
        AND p.name IN (
          'can_create_apr', 'can_view_apr',
          'can_view_pt', 'can_manage_pt',
          'can_view_dashboard',
          'can_view_signatures', 'can_manage_signatures',
          'can_view_dds', 'can_manage_dds',
          'can_view_dids', 'can_manage_dids',
          'can_view_rdos', 'can_manage_rdos',
          'can_view_epi_assignments', 'can_manage_epi_assignments',
          'can_view_notifications', 'can_manage_notifications',
          'can_view_sites'
        )
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 8. Trabalhador (acesso mínimo de leitura)
    // =========================================================================
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Trabalhador'
        AND p.name IN (
          'can_view_dashboard',
          'can_view_checklists',
          'can_view_signatures', 'can_manage_signatures',
          'can_view_dds',
          'can_view_dids',
          'can_view_notifications', 'can_manage_notifications',
          'can_view_sites'
        )
      ON CONFLICT DO NOTHING
    `);

    // =========================================================================
    // 9. Sincronizar user_roles com profiles existentes
    //    Para usuários que têm profile mas não têm user_roles, inserir o role
    //    correspondente automaticamente (migração de dados).
    //    Usa SET LOCAL app.is_super_admin = 'true' para bypasear RLS nas
    //    tabelas `users` e `user_roles` durante a migration.
    // =========================================================================
    await queryRunner.query(`SET LOCAL app.is_super_admin = 'true'`);
    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id
      FROM users u
      JOIN profiles p ON p.id = u.profile_id
      JOIN roles r ON r.name = p.nome
      WHERE u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = u.id AND ur.role_id = r.id
        )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`SET LOCAL app.is_super_admin = 'false'`);

    // =========================================================================
    // 10. Adicionar RLS à tabela `dids`
    //     (criada em migration 096 sem RLS — falha de segurança multi-tenant)
    // =========================================================================
    if (await queryRunner.hasTable('dids')) {
      await queryRunner.query(`ALTER TABLE "dids" ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "dids" FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dids"`,
      );
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "dids"
        USING (
          company_id = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          company_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }

    // =========================================================================
    // 11. Adicionar RLS à tabela `did_participants`
    //     (tabela de junção: acesso controlado por tenant via did_id → dids)
    // =========================================================================
    if (await queryRunner.hasTable('did_participants')) {
      await queryRunner.query(
        `ALTER TABLE "did_participants" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "did_participants" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "did_participants"`,
      );
      // Política baseada no company_id do DID pai
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "did_participants"
        USING (
          EXISTS (
            SELECT 1 FROM dids d
            WHERE d.id = did_id
              AND (
                d.company_id = current_company()
                OR is_super_admin() = true
              )
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM dids d
            WHERE d.id = did_id
              AND (
                d.company_id = current_company()
                OR is_super_admin() = true
              )
          )
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove RLS das tabelas dids e did_participants
    if (await queryRunner.hasTable('did_participants')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "did_participants"`,
      );
      await queryRunner.query(
        `ALTER TABLE "did_participants" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "did_participants" DISABLE ROW LEVEL SECURITY`,
      );
    }

    if (await queryRunner.hasTable('dids')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dids"`,
      );
      await queryRunner.query(`ALTER TABLE "dids" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "dids" DISABLE ROW LEVEL SECURITY`);
    }

    // Remove role_permissions inseridas por esta migration (apenas as que não existiam antes)
    // Nota: não remover roles nem permissions — podem ser usados por dados existentes.
  }
}
