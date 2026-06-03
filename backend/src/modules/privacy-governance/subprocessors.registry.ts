export type SubprocessorStatus =
  | 'active'
  | 'configured_if_enabled'
  | 'pending_review';

export type DpaStatus = 'available' | 'pending_review' | 'not_applicable';

export type TransferMechanism =
  | 'brazil'
  | 'international_contractual_safeguards'
  | 'provider_terms_pending_review';

export type PrivacySubprocessor = {
  id: string;
  provider: string;
  service: string;
  category:
    | 'hosting'
    | 'database'
    | 'cache_queue'
    | 'observability'
    | 'ai'
    | 'calendar'
    | 'email'
    | 'file_storage'
    | 'cdn';
  status: SubprocessorStatus;
  countries: string[];
  purpose: string;
  dataCategories: string[];
  sensitiveDataRisk: 'low' | 'medium' | 'high';
  internationalTransfer: boolean;
  transferMechanism: TransferMechanism;
  dpaStatus: DpaStatus;
  evidenceRequired: string[];
};

export const PRIVACY_SUBPROCESSORS: PrivacySubprocessor[] = [
  {
    id: 'render',
    provider: 'Render',
    service: 'Hospedagem do backend e worker',
    category: 'hosting',
    status: 'active',
    countries: ['Estados Unidos'],
    purpose:
      'Execucao da API, workers, processamento assíncrono e logs operacionais',
    dataCategories: [
      'conta',
      'tenant',
      'logs tecnicos',
      'metadados operacionais',
    ],
    sensitiveDataRisk: 'medium',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: ['DPA vigente', 'regiao do servico', 'politica de logs'],
  },
  {
    id: 'supabase-postgres',
    provider: 'Supabase/PostgreSQL',
    service: 'Banco de dados relacional',
    category: 'database',
    status: 'configured_if_enabled',
    countries: ['Conforme projeto/configuracao'],
    purpose: 'Persistencia multi-tenant de dados operacionais, SST e auditoria',
    dataCategories: [
      'usuarios',
      'trabalhadores',
      'documentos SST',
      'logs',
      'consentimentos',
    ],
    sensitiveDataRisk: 'high',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'DPA vigente',
      'regiao do banco',
      'configuracao de backup',
    ],
  },
  {
    id: 'redis',
    provider: 'Redis gerenciado',
    service: 'Cache, filas e rate limiting',
    category: 'cache_queue',
    status: 'configured_if_enabled',
    countries: ['Conforme provedor/configuracao'],
    purpose: 'Controle de filas, rate limiting, cache e tarefas assíncronas',
    dataCategories: [
      'identificadores de usuario',
      'tenant',
      'metadados de jobs',
    ],
    sensitiveDataRisk: 'medium',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: ['provedor real', 'regiao', 'TTL de filas/cache'],
  },
  {
    id: 'openai',
    provider: 'OpenAI',
    service: 'Sophie / recursos de IA',
    category: 'ai',
    status: 'configured_if_enabled',
    countries: ['Estados Unidos'],
    purpose:
      'Geracao de respostas assistivas sobre SST com minimizacao e sanitizacao previa',
    dataCategories: [
      'prompts',
      'contexto operacional minimizado',
      'metadados de uso',
    ],
    sensitiveDataRisk: 'high',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'DPA/API data processing terms',
      'retencao do provedor',
      'DPIA/RIPD de IA',
    ],
  },
  {
    id: 'sentry',
    provider: 'Sentry',
    service: 'Monitoramento de erros',
    category: 'observability',
    status: 'configured_if_enabled',
    countries: ['Estados Unidos/Uniao Europeia conforme conta'],
    purpose: 'Diagnostico de erros, stack traces e estabilidade',
    dataCategories: [
      'logs de erro',
      'metadados de navegador',
      'usuario pseudonimizado',
    ],
    sensitiveDataRisk: 'medium',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'DPA vigente',
      'configuracao de PII scrubbing',
      'retencao de eventos',
    ],
  },
  {
    id: 'newrelic',
    provider: 'New Relic',
    service: 'Observabilidade/APM',
    category: 'observability',
    status: 'configured_if_enabled',
    countries: ['Estados Unidos/Uniao Europeia conforme conta'],
    purpose: 'Metricas, traces e telemetria de performance',
    dataCategories: [
      'metadados tecnicos',
      'rotas',
      'logs/traces se habilitados',
    ],
    sensitiveDataRisk: 'medium',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'DPA vigente',
      'politica de logs',
      'mascaramento de atributos',
    ],
  },
  {
    id: 'google-calendar',
    provider: 'Google',
    service: 'Google Calendar API',
    category: 'calendar',
    status: 'configured_if_enabled',
    countries: ['Global conforme conta Google Workspace/Cloud'],
    purpose: 'Sincronizacao de eventos operacionais e agenda',
    dataCategories: ['eventos', 'nomes', 'e-mails', 'datas e descricoes'],
    sensitiveDataRisk: 'medium',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'base contratual Google',
      'escopos OAuth',
      'politica de compartilhamento',
    ],
  },
  {
    id: 'file-storage',
    provider: 'Armazenamento S3/R2 ou equivalente',
    service: 'Arquivos, PDFs e evidencias',
    category: 'file_storage',
    status: 'configured_if_enabled',
    countries: ['Conforme bucket/regiao configurados'],
    purpose: 'Armazenamento de documentos, PDFs gerados, anexos e evidencias',
    dataCategories: ['documentos SST', 'assinaturas', 'evidencias', 'PDFs'],
    sensitiveDataRisk: 'high',
    internationalTransfer: true,
    transferMechanism: 'provider_terms_pending_review',
    dpaStatus: 'pending_review',
    evidenceRequired: [
      'provedor real',
      'regiao do bucket',
      'politica de lifecycle',
      'criptografia',
    ],
  },
];
