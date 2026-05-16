/**
 * Constantes tipadas para todas as permissões granulares do sistema.
 *
 * Use AppPermission em vez de strings literais ao chamar hasPermission().
 * Isso garante que erros de digitação sejam detectados em compile-time,
 * e que uma busca por Permission.CAN_VIEW_RISKS encontre todos os usos.
 *
 * Exemplo:
 *   hasPermission(Permission.CAN_VIEW_RISKS)   ← correto
 *   hasPermission('can_view_risks')            ← ainda funciona (backward compat)
 */

export const Permission = {
  // Visualização
  CAN_VIEW_DASHBOARD: 'can_view_dashboard',
  CAN_VIEW_RISKS: 'can_view_risks',
  CAN_VIEW_ARRS: 'can_view_arrs',
  CAN_VIEW_DIDS: 'can_view_dids',
  CAN_VIEW_ACTIVITIES: 'can_view_activities',
  CAN_VIEW_TRAININGS: 'can_view_trainings',
  CAN_VIEW_MEDICAL_EXAMS: 'can_view_medical_exams',
  CAN_VIEW_EPI_ASSIGNMENTS: 'can_view_epi_assignments',
  CAN_VIEW_SIGNATURES: 'can_view_signatures',
  CAN_VIEW_MAIL: 'can_view_mail',
  CAN_VIEW_DOSSIERS: 'can_view_dossiers',
  CAN_VIEW_DOCUMENTS_REGISTRY: 'can_view_documents_registry',
  CAN_VIEW_CHECKLISTS: 'can_view_checklists',
  CAN_VIEW_SITES: 'can_view_sites',
  CAN_VIEW_USERS: 'can_view_users',
  CAN_VIEW_EXPENSES: 'can_view_expenses',
  CAN_VIEW_PHOTOGRAPHIC_REPORTS: 'can_view_photographic_reports',
  CAN_VIEW_RDOS: 'can_view_rdos',

  // Gestão
  CAN_MANAGE_ARRS: 'can_manage_arrs',
  CAN_MANAGE_DIDS: 'can_manage_dids',
  CAN_MANAGE_ACTIVITIES: 'can_manage_activities',
  CAN_MANAGE_TRAININGS: 'can_manage_trainings',
  CAN_MANAGE_MEDICAL_EXAMS: 'can_manage_medical_exams',
  CAN_MANAGE_EPI_ASSIGNMENTS: 'can_manage_epi_assignments',
  CAN_MANAGE_CHECKLISTS: 'can_manage_checklists',
  CAN_MANAGE_SIGNATURES: 'can_manage_signatures',
  CAN_MANAGE_MAIL: 'can_manage_mail',
  CAN_MANAGE_NC: 'can_manage_nc',
  CAN_MANAGE_PT: 'can_manage_pt',
  CAN_MANAGE_SITES: 'can_manage_sites',
  CAN_MANAGE_USERS: 'can_manage_users',
  CAN_MANAGE_EXPENSES: 'can_manage_expenses',
  CAN_CLOSE_EXPENSES: 'can_close_expenses',
  CAN_MANAGE_CATALOGS: 'can_manage_catalogs',
  CAN_MANAGE_PHOTOGRAPHIC_REPORTS: 'can_manage_photographic_reports',

  // Ações
  CAN_APPROVE_PT: 'can_approve_pt',
  CAN_IMPORT_DOCUMENTS: 'can_import_documents',
  CAN_USE_AI: 'can_use_ai',
} as const;

export type AppPermission = (typeof Permission)[keyof typeof Permission];
