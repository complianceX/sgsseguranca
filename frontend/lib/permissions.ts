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
  CAN_VIEW_SIGNATURES: 'can_view_signatures',
  CAN_VIEW_MAIL: 'can_view_mail',
  CAN_VIEW_DOSSIERS: 'can_view_dossiers',
  CAN_VIEW_DOCUMENTS_REGISTRY: 'can_view_documents_registry',
  CAN_VIEW_CHECKLISTS: 'can_view_checklists',

  // Gestão
  CAN_MANAGE_ARRS: 'can_manage_arrs',
  CAN_MANAGE_DIDS: 'can_manage_dids',
  CAN_MANAGE_CHECKLISTS: 'can_manage_checklists',
  CAN_MANAGE_SIGNATURES: 'can_manage_signatures',
  CAN_MANAGE_MAIL: 'can_manage_mail',
  CAN_MANAGE_NC: 'can_manage_nc',
  CAN_MANAGE_PT: 'can_manage_pt',

  // Ações
  CAN_APPROVE_PT: 'can_approve_pt',
  CAN_IMPORT_DOCUMENTS: 'can_import_documents',
  CAN_USE_AI: 'can_use_ai',
} as const;

export type AppPermission = (typeof Permission)[keyof typeof Permission];
