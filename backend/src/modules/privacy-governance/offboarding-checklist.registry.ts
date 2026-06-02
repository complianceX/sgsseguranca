export type TenantOffboardingStep = {
  order: number;
  title: string;
  owner: 'admin' | 'controller' | 'engineering' | 'legal';
  evidence: string;
  blocking: boolean;
};

export const TENANT_OFFBOARDING_CHECKLIST: TenantOffboardingStep[] = [
  {
    order: 1,
    title: 'Confirmar legitimidade da solicitação e identidade do controlador',
    owner: 'legal',
    evidence: 'registro de solicitação, contrato, solicitante autorizado',
    blocking: true,
  },
  {
    order: 2,
    title: 'Congelar alterações destrutivas e exportar dados do tenant',
    owner: 'admin',
    evidence: 'hash/manifesto da exportação e data de disponibilização',
    blocking: true,
  },
  {
    order: 3,
    title: 'Revogar acessos ativos, sessões e integrações externas',
    owner: 'admin',
    evidence: 'lista de usuários/sessões revogados e integrações desabilitadas',
    blocking: true,
  },
  {
    order: 4,
    title: 'Executar soft-delete do tenant e registrar tabelas afetadas',
    owner: 'engineering',
    evidence:
      'resposta de deleteCompanyData e trilha de auditoria administrativa',
    blocking: true,
  },
  {
    order: 5,
    title: 'Inventariar arquivos, PDFs, evidências e anexos em storage',
    owner: 'engineering',
    evidence:
      'manifesto de objetos por tenant e política de lifecycle aplicada',
    blocking: true,
  },
  {
    order: 6,
    title: 'Acompanhar expurgo por retenção e backups',
    owner: 'engineering',
    evidence:
      'runs de gdpr_retention_cleanup_runs e evidência do provedor de backup',
    blocking: false,
  },
  {
    order: 7,
    title: 'Registrar exceções de guarda legal ou legal hold',
    owner: 'legal',
    evidence: 'fundamento legal, período, escopo e responsável pela retenção',
    blocking: false,
  },
  {
    order: 8,
    title: 'Emitir fechamento para o controlador',
    owner: 'admin',
    evidence:
      'protocolo final com exportação, exclusões, exceções e pendências',
    blocking: false,
  },
];
