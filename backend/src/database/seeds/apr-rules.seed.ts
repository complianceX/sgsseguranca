import { DataSource } from 'typeorm';
import {
  AprRule,
  AprRuleSeverity,
  AprRuleCategory,
} from '../../aprs/entities/apr-rule.entity';

const RULES: Omit<AprRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'NR35_ALTURA_SEM_CERT',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.NR,
    title: 'Trabalho em altura sem certificação NR-35',
    description:
      'Atividade em altura ou risco de queda identificado sem EPI trava-queda, EPC andaime/plataforma e sem NR-35 referenciada nos documentos exigidos.',
    operationalMessage:
      'Atividade em altura identificada. Inclua NR-35 nos documentos exigidos e adicione trava-queda como EPI obrigatório.',
    triggerCondition: {
      type: 'NR35_ALTURA',
      activityKeywords: ['altura', 'trabalho em altura'],
      riskKeywords: ['queda'],
      requiredEpiKeywords: ['trava-queda', 'trava queda'],
      requiredEpcKeywords: ['andaime', 'plataforma'],
      requiredNrKeyword: 'NR-35',
    },
    remediation:
      'Adicione "NR-35" ao campo de normas relacionadas do item de risco, inclua trava-queda como EPI e/ou andaime/plataforma como EPC.',
    nrReference: 'NR-35, item 35.3.1',
  },
  {
    code: 'NR10_ELETRICA_SEM_CERT',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.NR,
    title: 'Trabalho elétrico sem habilitação NR-10',
    description:
      'Risco elétrico ou atividade elétrica identificada sem NR-10 referenciada nos documentos exigidos.',
    operationalMessage:
      'Risco elétrico identificado. Inclua NR-10 nos documentos exigidos.',
    triggerCondition: {
      type: 'NR10_ELETRICA',
      activityKeywords: ['elétric', 'eletric', 'elétrica', 'eletrica'],
      riskKeywords: ['choque', 'elétric', 'eletric'],
      requiredNrKeyword: 'NR-10',
    },
    remediation:
      'Adicione "NR-10" ao campo de normas relacionadas do item de risco correspondente ao risco elétrico.',
    nrReference: 'NR-10, item 10.8',
  },
  {
    code: 'NR33_CONFINADO_SEM_PT',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.PT,
    title: 'Espaço confinado sem Permissão de Trabalho',
    description:
      'Atividade em espaço confinado ou risco de espaço confinado identificado sem Permissão de Trabalho (PT) preenchida.',
    operationalMessage:
      'Espaço confinado exige Permissão de Trabalho (PT) obrigatória. Preencha o campo PT.',
    triggerCondition: {
      type: 'NR33_CONFINADO',
      activityKeywords: ['confinado', 'espaço confinado'],
      riskKeywords: ['espaço confinado', 'confinado'],
    },
    remediation:
      'Preencha o campo "Permissão de Trabalho" em todos os itens de risco relacionados a espaço confinado.',
    nrReference: 'NR-33, item 33.3',
  },
  {
    code: 'RISCO_CRITICO_SEM_CONTROLE',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.EPC,
    title: 'Risco crítico sem medida de controle robusta',
    description:
      'Existe risco com probabilidade ALTA (≥4) e severidade ALTA (≥4) sem nenhum EPC ou EPI associado.',
    operationalMessage:
      'Risco crítico (alta probabilidade + alta severidade) sem medida de controle. Adicione EPC ou EPI.',
    triggerCondition: {
      type: 'RISCO_CRITICO_SEM_CONTROLE',
      minProbabilidade: 4,
      minSeveridade: 4,
    },
    remediation:
      'Para cada risco com probabilidade ≥ 4 e severidade ≥ 4, preencha o campo EPC ou EPI com a medida de controle aplicável.',
    nrReference: null,
  },
  {
    code: 'SEM_RESPONSAVEL_TECNICO',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.RESPONSAVEL,
    title: 'APR sem responsável técnico identificado',
    description: 'O campo responsável técnico da APR está vazio.',
    operationalMessage:
      'Indique o responsável técnico pela APR antes de submeter.',
    triggerCondition: {
      type: 'SEM_RESPONSAVEL_TECNICO',
    },
    remediation:
      'Preencha o campo "Responsável Técnico" na APR com o nome e registro do profissional responsável.',
    nrReference: null,
  },
  {
    code: 'APR_SEM_RISCO',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.CONSISTENCIA,
    title: 'APR submetida sem nenhum risco cadastrado',
    description:
      'A lista de riscos (risk_items) está vazia no momento da submissão.',
    operationalMessage: 'Toda APR deve ter ao menos um risco identificado.',
    triggerCondition: {
      type: 'APR_SEM_RISCO',
    },
    remediation: 'Adicione ao menos um item de risco à APR antes de submeter.',
    nrReference: null,
  },
  {
    code: 'EPI_SEM_CA',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.ADVERTENCIA,
    category: AprRuleCategory.EPI,
    title: 'EPI listado sem número de CA',
    description:
      'Há item de risco com EPI preenchido mas sem número de CA informado.',
    operationalMessage:
      'Recomendado informar o CA do EPI para fins de auditoria.',
    triggerCondition: {
      type: 'EPI_SEM_CA',
    },
    remediation:
      'Informe o número do Certificado de Aprovação (CA) do EPI no campo correspondente.',
    nrReference: null,
  },
  {
    code: 'DESCRICAO_RISCO_CURTA',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.ADVERTENCIA,
    category: AprRuleCategory.CONSISTENCIA,
    title: 'Descrição de risco muito curta',
    description:
      'Algum item de risco possui descrição (condicao_perigosa) com menos de 20 caracteres.',
    operationalMessage:
      'Descrição de risco muito genérica. Detalhe melhor para facilitar o entendimento em campo.',
    triggerCondition: {
      type: 'DESCRICAO_RISCO_CURTA',
      minLength: 20,
    },
    remediation:
      'Expanda a descrição do risco com pelo menos 20 caracteres, detalhando a condição perigosa e o contexto.',
    nrReference: null,
  },
];

export async function seedAprRules(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(AprRule);

  for (const rule of RULES) {
    const existing = await repo.findOne({ where: { code: rule.code } });
    if (!existing) {
      await repo.save(repo.create(rule));
    }
  }
}
