export const APR_PERMISSIONS = {
  CREATE: 'can_create_apr',
  VIEW: 'can_view_apr',
  UPDATE: 'can_update_apr',
  DELETE: 'can_delete_apr',
  APPROVE: 'can_approve_apr',
  REJECT: 'can_reject_apr',
  FINALIZE: 'can_finalize_apr',
  IMPORT_PDF: 'can_import_apr_pdf',
  GENERATE_PDF: 'can_generate_apr_pdf',
} as const;

export const APR_DEFAULT_APPROVAL_STEP_TEMPLATES = [
  {
    level_order: 1,
    title: 'Validação técnica SST',
    approver_role: 'Técnico de Segurança do Trabalho (TST)',
  },
  {
    level_order: 2,
    title: 'Liberação da supervisão operacional',
    approver_role: 'Supervisor / Encarregado',
  },
  {
    level_order: 3,
    title: 'Aprovação gerencial da empresa',
    approver_role: 'Administrador da Empresa',
  },
] as const;
