import { Repository } from 'typeorm';
import { AprRule, AprRuleSeverity, AprRuleCategory } from '../entities/apr-rule.entity';
import { Apr } from '../entities/apr.entity';
import { AprRiskItem } from '../entities/apr-risk-item.entity';
import { AprRulesEngineService } from './apr-rules-engine.service';

function makeRule(overrides: Partial<AprRule> = {}): AprRule {
  return {
    id: 'rule-1',
    code: 'TEST_RULE',
    version: 1,
    isActive: true,
    severity: AprRuleSeverity.BLOQUEANTE,
    category: AprRuleCategory.NR,
    title: 'Regra Teste',
    description: 'Desc',
    operationalMessage: 'Mensagem operacional',
    remediation: 'Remediar',
    nrReference: null,
    triggerCondition: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeApr(overrides: Partial<Apr> = {}): Apr {
  return {
    id: 'apr-1',
    company_id: 'company-1',
    titulo: 'APR Teste',
    descricao: null,
    tipo_atividade: null,
    responsavel_tecnico_nome: 'Eng. Silva',
    risk_items: [],
    ...overrides,
  } as unknown as Apr;
}

function makeRiskItem(overrides: Partial<AprRiskItem> = {}): AprRiskItem {
  return {
    id: 'item-1',
    agente_ambiental: 'Queda de altura',
    condicao_perigosa: 'Trabalho em andaimes sem proteção',
    fonte_circunstancia: null,
    lesao: null,
    atividade: null,
    probabilidade: 2,
    severidade: 2,
    epi: null,
    epc: null,
    normas_relacionadas: null,
    permissao_trabalho: null,
    ...overrides,
  } as unknown as AprRiskItem;
}

describe('AprRulesEngineService', () => {
  let repo: { find: jest.Mock };
  let service: AprRulesEngineService;

  beforeEach(() => {
    repo = { find: jest.fn() };
    service = new AprRulesEngineService(repo as unknown as Repository<AprRule>);
  });

  it('retorna isValid=true e score=100 quando não há regras ativas', async () => {
    repo.find.mockResolvedValue([]);
    const apr = makeApr();
    const result = await service.validate(apr);

    expect(result.isValid).toBe(true);
    expect(result.score).toBe(100);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('classifica violação BLOQUEANTE corretamente e reduz score em 20', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        severity: AprRuleSeverity.BLOQUEANTE,
        triggerCondition: { type: 'APR_SEM_RISCO' },
      }),
    ]);
    const apr = makeApr({ risk_items: [] } as never);
    const result = await service.validate(apr);

    expect(result.isValid).toBe(false);
    expect(result.score).toBe(80);
    expect(result.blockers).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('classifica violação ADVERTENCIA corretamente e reduz score em 5', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        severity: AprRuleSeverity.ADVERTENCIA,
        triggerCondition: { type: 'APR_SEM_RISCO' },
      }),
    ]);
    const apr = makeApr({ risk_items: [] } as never);
    const result = await service.validate(apr);

    expect(result.isValid).toBe(true);
    expect(result.score).toBe(95);
    expect(result.warnings).toHaveLength(1);
  });

  it('score mínimo é 0 mesmo com muitas violações', async () => {
    repo.find.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        makeRule({
          code: `RULE_${i}`,
          severity: AprRuleSeverity.BLOQUEANTE,
          triggerCondition: { type: 'APR_SEM_RISCO' },
        }),
      ),
    );
    const apr = makeApr({ risk_items: [] } as never);
    const result = await service.validate(apr);

    expect(result.score).toBe(0);
  });

  it('NR35_ALTURA dispara quando atividade de altura sem EPI/EPC/NR adequados', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'NR35_ALTURA',
          activityKeywords: ['altura', 'andaime'],
          riskKeywords: [],
          requiredEpiKeywords: ['talabarte', 'capacete'],
          requiredEpcKeywords: ['guarda-corpo'],
          requiredNrKeyword: 'NR-35',
        },
      }),
    ]);
    const apr = makeApr({ tipo_atividade: 'Trabalho em altura' } as never);
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('NR35_ALTURA não dispara quando EPI adequado está presente', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'NR35_ALTURA',
          activityKeywords: ['altura'],
          riskKeywords: [],
          requiredEpiKeywords: ['talabarte'],
          requiredEpcKeywords: [],
          requiredNrKeyword: '',
        },
      }),
    ]);
    const apr = makeApr({ tipo_atividade: 'Trabalho em altura' } as never);
    const item = makeRiskItem({ epi: 'Talabarte de posicionamento' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(0);
  });

  it('NR10_ELETRICA dispara quando atividade elétrica sem referência NR-10', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'NR10_ELETRICA',
          activityKeywords: ['elétrica', 'eletricidade'],
          riskKeywords: [],
          requiredNrKeyword: 'NR-10',
        },
      }),
    ]);
    const apr = makeApr({ tipo_atividade: 'Manutenção elétrica' } as never);
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('NR33_CONFINADO dispara quando espaço confinado sem permissão de trabalho', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'NR33_CONFINADO',
          activityKeywords: ['confinado', 'tanque'],
          riskKeywords: [],
        },
      }),
    ]);
    const apr = makeApr({ tipo_atividade: 'Entrada em espaço confinado' } as never);
    const item = makeRiskItem({ permissao_trabalho: null });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('NR33_CONFINADO não dispara quando permissão de trabalho está preenchida', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'NR33_CONFINADO',
          activityKeywords: ['confinado'],
          riskKeywords: [],
        },
      }),
    ]);
    const apr = makeApr({ tipo_atividade: 'Entrada em espaço confinado' } as never);
    const item = makeRiskItem({ permissao_trabalho: 'PT-2026-001' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(0);
  });

  it('RISCO_CRITICO_SEM_CONTROLE dispara quando risco crítico sem EPI ou EPC', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'RISCO_CRITICO_SEM_CONTROLE',
          minProbabilidade: 4,
          minSeveridade: 4,
        },
      }),
    ]);
    const apr = makeApr();
    const item = makeRiskItem({ probabilidade: 5, severidade: 5, epi: null, epc: null });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('RISCO_CRITICO_SEM_CONTROLE não dispara quando EPC está presente', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: {
          type: 'RISCO_CRITICO_SEM_CONTROLE',
          minProbabilidade: 4,
          minSeveridade: 4,
        },
      }),
    ]);
    const apr = makeApr();
    const item = makeRiskItem({ probabilidade: 5, severidade: 5, epc: 'Guarda-corpo' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(0);
  });

  it('SEM_RESPONSAVEL_TECNICO dispara quando campo está vazio', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'SEM_RESPONSAVEL_TECNICO' },
      }),
    ]);
    const apr = makeApr({ responsavel_tecnico_nome: '' } as never);
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('APR_SEM_RISCO dispara quando não há itens de risco', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'APR_SEM_RISCO' },
      }),
    ]);
    const apr = makeApr({ risk_items: [] } as never);
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('EPI_SEM_CA dispara quando EPI listado sem número CA', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'EPI_SEM_CA' },
      }),
    ]);
    const apr = makeApr();
    const item = makeRiskItem({ epi: 'Capacete de segurança' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('EPI_SEM_CA não dispara quando CA está presente', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'EPI_SEM_CA' },
      }),
    ]);
    const apr = makeApr();
    const item = makeRiskItem({ epi: 'Capacete CA 12345' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(0);
  });

  it('DESCRICAO_RISCO_CURTA dispara quando descrição é curta demais', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'DESCRICAO_RISCO_CURTA', minLength: 20 },
      }),
    ]);
    const apr = makeApr();
    const item = makeRiskItem({ condicao_perigosa: 'Queda' });
    (apr as unknown as { risk_items: AprRiskItem[] }).risk_items = [item];
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(1);
  });

  it('regra com tipo desconhecido não dispara e não lança exceção', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        triggerCondition: { type: 'TIPO_INEXISTENTE' },
      }),
    ]);
    const apr = makeApr();
    const result = await service.validate(apr);
    expect(result.blockers).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });

  it('erros durante avaliação são silenciados e processamento continua', async () => {
    repo.find.mockResolvedValue([
      makeRule({
        code: 'RULE_BAD',
        triggerCondition: { type: 'RISCO_CRITICO_SEM_CONTROLE', minProbabilidade: null },
      }),
      makeRule({
        code: 'RULE_OK',
        triggerCondition: { type: 'APR_SEM_RISCO' },
      }),
    ]);
    const apr = makeApr({ risk_items: [] } as never);
    const result = await service.validate(apr);
    // RULE_OK should still fire despite RULE_BAD potentially erroring
    expect(result.blockers.some((b) => b.ruleCode === 'RULE_OK')).toBe(true);
  });

  it('appliedRuleSnapshot inclui código e versão de cada regra', async () => {
    const rules = [
      makeRule({ code: 'RULE_A', version: 1, triggerCondition: null }),
      makeRule({ code: 'RULE_B', version: 2, triggerCondition: null }),
    ];
    repo.find.mockResolvedValue(rules);
    const result = await service.validate(makeApr());

    const snapshot = JSON.parse(result.appliedRuleSnapshot) as Array<{ code: string; version: number }>;
    expect(snapshot).toEqual([
      { code: 'RULE_A', version: 1 },
      { code: 'RULE_B', version: 2 },
    ]);
  });
});
