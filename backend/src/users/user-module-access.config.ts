export type UserModuleAccessKey =
  | 'trainings'
  | 'medical-exams'
  | 'epi-assignments'
  | 'epis'
  | 'activities'
  | 'risks'
  | 'dds'
  | 'dids'
  | 'arrs'
  | 'rdos'
  | 'pts'
  | 'aprs'
  | 'inspections'
  | 'audits'
  | 'checklists'
  | 'dossiers'
  | 'documents-registry'
  | 'expenses';

export type UserModuleAccessOption = {
  key: UserModuleAccessKey;
  label: string;
  description: string;
  permissions: string[];
};

export const USER_MODULE_ACCESS_OPTIONS: readonly UserModuleAccessOption[] = [
  {
    key: 'trainings',
    label: 'Treinamentos',
    description: 'Libera visualização e gestão de treinamentos SST.',
    permissions: ['can_view_trainings', 'can_manage_trainings'],
  },
  {
    key: 'medical-exams',
    label: 'Exames médicos',
    description: 'Libera controle de ASOs e exames periódicos.',
    permissions: ['can_view_medical_exams', 'can_manage_medical_exams'],
  },
  {
    key: 'epi-assignments',
    label: 'Fichas de EPI',
    description: 'Libera gestão das fichas de entrega de EPI.',
    permissions: ['can_view_epi_assignments', 'can_manage_epi_assignments'],
  },
  {
    key: 'epis',
    label: 'EPIs',
    description: 'Libera o cadastro e manutenção do catálogo de EPIs.',
    permissions: ['can_manage_catalogs'],
  },
  {
    key: 'activities',
    label: 'Atividades',
    description: 'Libera cadastro e acompanhamento de atividades operacionais.',
    permissions: ['can_view_activities', 'can_manage_activities'],
  },
  {
    key: 'risks',
    label: 'Riscos',
    description: 'Libera leitura e manutenção do cadastro de riscos.',
    permissions: ['can_view_risks', 'can_edit_risks'],
  },
  {
    key: 'dds',
    label: 'DDS',
    description: 'Libera leitura e gestão dos Diálogos de Segurança.',
    permissions: ['can_view_dds', 'can_manage_dds'],
  },
  {
    key: 'dids',
    label: 'DID',
    description: 'Libera leitura e gestão dos Diálogos de Início do Dia.',
    permissions: ['can_view_dids', 'can_manage_dids'],
  },
  {
    key: 'arrs',
    label: 'ARR',
    description: 'Libera leitura e gestão de Análises de Risco Rápidas.',
    permissions: ['can_view_arrs', 'can_manage_arrs'],
  },
  {
    key: 'rdos',
    label: 'RDO',
    description: 'Libera leitura e gestão de Relatórios Diários de Obra.',
    permissions: ['can_view_rdos', 'can_manage_rdos'],
  },
  {
    key: 'pts',
    label: 'PT',
    description: 'Libera leitura, gestão e aprovação de Permissão de Trabalho.',
    permissions: ['can_view_pt', 'can_manage_pt', 'can_approve_pt'],
  },
  {
    key: 'aprs',
    label: 'APR',
    description: 'Libera leitura, edição, aprovação e PDF oficial de APR.',
    permissions: [
      'can_view_apr',
      'can_create_apr',
      'can_update_apr',
      'can_approve_apr',
      'can_reject_apr',
      'can_finalize_apr',
      'can_generate_apr_pdf',
      'can_delete_apr',
      'can_import_apr_pdf',
    ],
  },
  {
    key: 'inspections',
    label: 'Inspeções',
    description: 'Libera leitura e gestão de inspeções.',
    permissions: ['can_view_inspections', 'can_manage_inspections'],
  },
  {
    key: 'audits',
    label: 'Auditorias',
    description: 'Libera leitura e gestão de auditorias.',
    permissions: ['can_view_audits', 'can_manage_audits'],
  },
  {
    key: 'checklists',
    label: 'Checklists',
    description: 'Libera leitura e gestão de checklists.',
    permissions: ['can_view_checklists', 'can_manage_checklists'],
  },
  {
    key: 'dossiers',
    label: 'Dossiês',
    description: 'Libera leitura dos dossiês e pacotes de evidência.',
    permissions: ['can_view_dossiers'],
  },
  {
    key: 'documents-registry',
    label: 'Registro de documentos',
    description: 'Libera consulta ao registro documental.',
    permissions: ['can_view_documents_registry'],
  },
  {
    key: 'expenses',
    label: 'Despesas',
    description: 'Libera leitura e gestão de despesas operacionais.',
    permissions: [
      'can_view_expenses',
      'can_manage_expenses',
      'can_close_expenses',
    ],
  },
] as const;

export const USER_MODULE_ACCESS_KEYS = USER_MODULE_ACCESS_OPTIONS.map(
  (option) => option.key,
);

export const USER_MODULE_ACCESS_PERMISSION_WHITELIST = [
  ...new Set(
    USER_MODULE_ACCESS_OPTIONS.flatMap((option) => option.permissions),
  ),
].sort();

const USER_MODULE_ACCESS_KEY_SET = new Set<string>(USER_MODULE_ACCESS_KEYS);
const USER_MODULE_ACCESS_OPTION_MAP = new Map<
  UserModuleAccessKey,
  UserModuleAccessOption
>(USER_MODULE_ACCESS_OPTIONS.map((option) => [option.key, option]));

export function isUserModuleAccessKey(
  value: string,
): value is UserModuleAccessKey {
  return USER_MODULE_ACCESS_KEY_SET.has(value);
}

export function getUserModuleAccessOption(
  key: string,
): UserModuleAccessOption | undefined {
  return isUserModuleAccessKey(key)
    ? USER_MODULE_ACCESS_OPTION_MAP.get(key)
    : undefined;
}

export function normalizeUserModuleAccessKeys(
  candidate: unknown,
): UserModuleAccessKey[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const normalized = candidate
    .map((value) => String(value || '').trim())
    .filter(isUserModuleAccessKey);

  return Array.from(new Set(normalized));
}

export function resolvePermissionsFromModuleKeys(
  moduleKeys: UserModuleAccessKey[],
): string[] {
  return [
    ...new Set(
      moduleKeys.flatMap(
        (key) => USER_MODULE_ACCESS_OPTION_MAP.get(key)?.permissions || [],
      ),
    ),
  ].sort();
}
