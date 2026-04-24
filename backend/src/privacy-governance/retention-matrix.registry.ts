export type RetentionImplementationStatus =
  | 'implemented'
  | 'partially_implemented'
  | 'requires_external_evidence';

export type PrivacyRetentionMatrixEntry = {
  dataDomain: string;
  examples: string[];
  defaultRetention: string;
  legalBasis: string;
  deletionMode: 'hard_delete' | 'soft_delete_then_hard_delete' | 'legal_hold';
  sourceOfTruth: string;
  implementationStatus: RetentionImplementationStatus;
  evidenceRequired: string[];
};

export const PRIVACY_RETENTION_MATRIX: PrivacyRetentionMatrixEntry[] = [
  {
    dataDomain: 'Sessões e tokens',
    examples: ['sessões expiradas', 'refresh tokens revogados'],
    defaultRetention: '30 dias após expiração/revogação',
    legalBasis: 'execução do contrato e segurança da conta',
    deletionMode: 'hard_delete',
    sourceOfTruth: 'cleanup_expired_data() / data_retention_policies',
    implementationStatus: 'implemented',
    evidenceRequired: ['run em gdpr_retention_cleanup_runs'],
  },
  {
    dataDomain: 'E-mails e notificações transacionais',
    examples: ['mail_logs', 'eventos de entrega', 'falhas de envio'],
    defaultRetention: '90 dias após envio',
    legalBasis: 'legítimo interesse, segurança e suporte',
    deletionMode: 'hard_delete',
    sourceOfTruth: 'cleanup_expired_data() / data_retention_policies',
    implementationStatus: 'implemented',
    evidenceRequired: ['run em gdpr_retention_cleanup_runs'],
  },
  {
    dataDomain: 'Logs de auditoria e segurança',
    examples: ['audit_logs', 'trilhas de acesso', 'eventos administrativos'],
    defaultRetention: '730 dias',
    legalBasis: 'legítimo interesse, prevenção a fraude e apuração de incidentes',
    deletionMode: 'hard_delete',
    sourceOfTruth: 'cleanup_expired_data() / data_retention_policies',
    implementationStatus: 'implemented',
    evidenceRequired: ['run em gdpr_retention_cleanup_runs'],
  },
  {
    dataDomain: 'Interações com IA',
    examples: ['ai_interactions', 'prompts minimizados', 'respostas geradas'],
    defaultRetention: '365 dias após anonimização/soft-delete',
    legalBasis: 'consentimento, execução contratual ou legítimo interesse conforme contexto',
    deletionMode: 'soft_delete_then_hard_delete',
    sourceOfTruth: 'gdpr_delete_user_data() + cleanup_expired_data()',
    implementationStatus: 'partially_implemented',
    evidenceRequired: ['prova de consentimento versionado', 'DPIA/RIPD de IA', 'DPA do provedor'],
  },
  {
    dataDomain: 'Documentos APR/PT/DDS',
    examples: ['PDFs finais', 'document_registry', 'assinaturas', 'evidências'],
    defaultRetention: 'APR/PT: 1825 dias; DDS: 730 dias por padrão',
    legalBasis: 'obrigação legal/regulatória do controlador e execução contratual',
    deletionMode: 'legal_hold',
    sourceOfTruth: 'tenant_document_policies + document-retention worker',
    implementationStatus: 'partially_implemented',
    evidenceRequired: ['política do tenant', 'resultado do job document-retention', 'lifecycle do storage'],
  },
  {
    dataDomain: 'Dados de saúde ocupacional',
    examples: ['ASO', 'exames médicos', 'laudos', 'restrições ocupacionais'],
    defaultRetention: 'conforme obrigação legal do controlador',
    legalBasis: 'art. 11, II, a/b da LGPD e normas de SST aplicáveis',
    deletionMode: 'legal_hold',
    sourceOfTruth: 'política documental do controlador',
    implementationStatus: 'requires_external_evidence',
    evidenceRequired: ['matriz legal por documento', 'instrução do controlador', 'procedimento de bloqueio/eliminação'],
  },
  {
    dataDomain: 'Backups',
    examples: ['snapshots de banco', 'backups de arquivos', 'replicações de storage'],
    defaultRetention: 'conforme provedor e plano de DR contratado',
    legalBasis: 'segurança, continuidade de negócio e obrigação contratual',
    deletionMode: 'soft_delete_then_hard_delete',
    sourceOfTruth: 'plano de disaster recovery e configuração do provedor',
    implementationStatus: 'requires_external_evidence',
    evidenceRequired: ['retenção real de backups', 'janela de restauração', 'procedimento de expurgo por tenant quando possível'],
  },
];
