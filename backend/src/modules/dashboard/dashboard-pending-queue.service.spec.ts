import { DashboardPendingQueueService } from './dashboard-pending-queue.service';

type MockRepo = {
  find: jest.Mock<Promise<unknown[]>, [Record<string, unknown>?]>;
  createQueryBuilder: jest.Mock;
  queryBuilder: {
    leftJoinAndSelect: jest.Mock;
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
};

function createMockRepo(): MockRepo {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  return {
    find: jest
      .fn<Promise<unknown[]>, [Record<string, unknown>?]>()
      .mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => queryBuilder),
    queryBuilder,
  };
}

/** Cria uma instancia do servico com todos os repositorios mockados. */
function createService(overrides: Partial<Record<string, MockRepo>> = {}) {
  const aprsRepository = overrides.aprs ?? createMockRepo();
  const auditsRepository = overrides.audits ?? createMockRepo();
  const checklistsRepository = overrides.checklists ?? createMockRepo();
  const medicalExamsRepository = overrides.medicalExams ?? createMockRepo();
  const nonConformitiesRepository =
    overrides.nonConformities ?? createMockRepo();
  const ptsRepository = overrides.pts ?? createMockRepo();
  const trainingsRepository = overrides.trainings ?? createMockRepo();

  const service = new DashboardPendingQueueService(
    aprsRepository as never,
    auditsRepository as never,
    checklistsRepository as never,
    medicalExamsRepository as never,
    nonConformitiesRepository as never,
    ptsRepository as never,
    trainingsRepository as never,
    {
      getContext: jest.fn(() => ({
        companyId: 'company-1',
        siteScope: 'all',
        isSuperAdmin: false,
      })),
    } as never,
  );

  return {
    service,
    aprsRepository,
    auditsRepository,
    checklistsRepository,
    medicalExamsRepository,
    nonConformitiesRepository,
    ptsRepository,
    trainingsRepository,
  };
}

/** Input padrao para getPendingQueue sem escopo de obra. */
const DEFAULT_INPUT = {
  companyId: 'company-1',
  siteScope: 'all' as const,
  isSuperAdmin: false,
};

describe('DashboardPendingQueueService', () => {
  // ─── Query strategy ────────────────────────────────────────────────────────

  it('usa .find() para APRs, PTs e checklists', async () => {
    const { service, aprsRepository, ptsRepository, checklistsRepository } =
      createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    expect(aprsRepository.find).toHaveBeenCalledTimes(1);
    expect(ptsRepository.find).toHaveBeenCalledTimes(1);
    expect(checklistsRepository.find).toHaveBeenCalledTimes(1);
  });

  it('usa createQueryBuilder para NCs, treinamentos, exames e auditorias', async () => {
    const {
      service,
      nonConformitiesRepository,
      trainingsRepository,
      medicalExamsRepository,
      auditsRepository,
    } = createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    expect(nonConformitiesRepository.createQueryBuilder).toHaveBeenCalledTimes(
      1,
    );
    expect(trainingsRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(medicalExamsRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(auditsRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('filtro de auditorias inclui EXISTS sobre plano_acao para selecionar apenas pendentes no DB', async () => {
    const { service, auditsRepository } = createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    const andWhereCalls = auditsRepository.queryBuilder.andWhere.mock
      .calls as string[][];
    const existsCall = andWhereCalls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('EXISTS') &&
        sql.includes('plano_acao'),
    );
    expect(existsCall).toBeDefined();
  });

  it('filtro de treinamentos usa expressao SQL nativa com INTERVAL em vez de parametro Date', async () => {
    const { service, trainingsRepository } = createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    const andWhereCalls = trainingsRepository.queryBuilder.andWhere.mock
      .calls as string[][];
    const intervalCall = andWhereCalls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INTERVAL'),
    );
    expect(intervalCall).toBeDefined();
  });

  it('filtro de exames medicos usa expressao SQL nativa com INTERVAL em vez de parametro Date', async () => {
    const { service, medicalExamsRepository } = createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    const andWhereCalls = medicalExamsRepository.queryBuilder.andWhere.mock
      .calls as string[][];
    const intervalCall = andWhereCalls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INTERVAL'),
    );
    expect(intervalCall).toBeDefined();
  });

  it('inclui updated_at nas selecoes de APRs ordenadas por updated_at', async () => {
    const { service, aprsRepository } = createService();

    await service.getPendingQueue(DEFAULT_INPUT);

    type AprFindArgs = {
      select?: {
        updated_at?: boolean;
      };
    };
    const findArgs = aprsRepository.find.mock.calls[0]?.[0] as
      | AprFindArgs
      | undefined;
    expect(findArgs?.select?.updated_at).toBe(true);
  });

  // ─── Resposta degraded ─────────────────────────────────────────────────────

  it('retorna degraded:false quando todas as fontes carregam com sucesso', async () => {
    const { service } = createService();
    const result = await service.getPendingQueue(DEFAULT_INPUT);
    expect(result.degraded).toBe(false);
    expect(result.failedSources).toHaveLength(0);
  });

  it('retorna degraded:true e lista a fonte quando um repositorio falha', async () => {
    const pts = createMockRepo();
    pts.find.mockRejectedValueOnce(new Error('DB timeout'));

    const { service } = createService({ pts });
    const result = await service.getPendingQueue(DEFAULT_INPUT);

    expect(result.degraded).toBe(true);
    expect(result.failedSources).toContain('pts');
  });

  it('continua carregando as demais fontes quando uma falha', async () => {
    const aprs = createMockRepo();
    aprs.find.mockRejectedValueOnce(new Error('DB error'));

    const pts = createMockRepo();
    pts.find.mockResolvedValueOnce([
      {
        id: 'pt-1',
        titulo: 'PT Teste',
        status: 'Pendente',
        data_hora_fim: new Date(Date.now() + 86400000),
        residual_risk: 'medium',
        site: { id: 'site-1', nome: 'Obra 1' },
        responsavel: { nome: 'Resp 1' },
      },
    ]);

    const { service } = createService({ aprs, pts });
    const result = await service.getPendingQueue(DEFAULT_INPUT);

    expect(result.degraded).toBe(true);
    expect(result.items.some((i) => i.module === 'PT')).toBe(true);
  });

  // ─── summary.total consistente com items ─────────────────────────────────

  it('summary.total reflete apenas os itens retornados em items (maximo PAGE_SIZE)', async () => {
    const { service } = createService();
    const result = await service.getPendingQueue(DEFAULT_INPUT);
    expect(result.summary.total).toBe(result.items.length);
  });

  it('summary.totalFound >= summary.total sempre', async () => {
    const { service } = createService();
    const result = await service.getPendingQueue(DEFAULT_INPUT);
    expect(result.summary.totalFound).toBeGreaterThanOrEqual(
      result.summary.total,
    );
  });

  it('hasMore e false quando totalFound <= PAGE_SIZE', async () => {
    const { service } = createService();
    const result = await service.getPendingQueue(DEFAULT_INPUT);
    // com repositorios vazios, nenhum item e retornado
    expect(result.summary.hasMore).toBe(false);
  });

  // ─── Logica de SLA ──────────────────────────────────────────────────────────

  describe('buildSlaContext (via itens da fila)', () => {
    const now = new Date();

    function makePt(
      overrides: Partial<{
        id: string;
        data_hora_fim: Date | string | null;
        status: string;
        residual_risk: string;
      }>,
    ) {
      return {
        id: 'pt-sla',
        titulo: 'PT SLA',
        status: 'Pendente',
        data_hora_fim: null,
        residual_risk: 'medium',
        site: null,
        responsavel: null,
        ...overrides,
      };
    }

    it('slaStatus=unscheduled quando dueDate e nulo', async () => {
      const pts = createMockRepo();
      pts.find.mockResolvedValueOnce([makePt({ data_hora_fim: null })]);

      const { service } = createService({ pts });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'PT');
      expect(item?.slaStatus).toBe('unscheduled');
      expect(item?.breached).toBe(false);
    });

    it('slaStatus=breached quando dueDate esta no passado', async () => {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const pts = createMockRepo();
      pts.find.mockResolvedValueOnce([makePt({ data_hora_fim: yesterday })]);

      const { service } = createService({ pts });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'PT');
      expect(item?.slaStatus).toBe('breached');
      expect(item?.breached).toBe(true);
      expect(item?.overdueByDays).toBeGreaterThanOrEqual(1);
    });

    it('slaStatus=due_today quando dueDate e hoje', async () => {
      const today = new Date(now);
      today.setHours(23, 59, 0, 0);

      const pts = createMockRepo();
      pts.find.mockResolvedValueOnce([makePt({ data_hora_fim: today })]);

      const { service } = createService({ pts });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'PT');
      expect(item?.slaStatus).toBe('due_today');
      expect(item?.breached).toBe(false);
    });

    it('slaStatus=due_soon quando dueDate e entre 1 e 3 dias', async () => {
      const inTwoDays = new Date(now);
      inTwoDays.setDate(inTwoDays.getDate() + 2);

      const pts = createMockRepo();
      pts.find.mockResolvedValueOnce([makePt({ data_hora_fim: inTwoDays })]);

      const { service } = createService({ pts });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'PT');
      expect(item?.slaStatus).toBe('due_soon');
    });

    it('slaStatus=on_track quando dueDate esta mais de 3 dias no futuro', async () => {
      const inTenDays = new Date(now);
      inTenDays.setDate(inTenDays.getDate() + 10);

      const pts = createMockRepo();
      pts.find.mockResolvedValueOnce([makePt({ data_hora_fim: inTenDays })]);

      const { service } = createService({ pts });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'PT');
      expect(item?.slaStatus).toBe('on_track');
      expect(item?.daysToDue).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── Logica de prioridade ──────────────────────────────────────────────────

  describe('prioridade de NCs', () => {
    function makeNc(
      overrides: Partial<{
        id: string;
        risco_nivel: string | null;
        acao_definitiva_prazo: string | null;
        status: string;
      }>,
    ) {
      return {
        id: 'nc-1',
        codigo_nc: 'NC-001',
        local_setor_area: 'Area A',
        descricao: 'Descricao',
        risco_nivel: null,
        status: 'aberta',
        updated_at: new Date(),
        acao_definitiva_prazo: null,
        acao_definitiva_data_prevista: null,
        acao_imediata_data: null,
        acao_definitiva_responsavel: null,
        acao_imediata_responsavel: null,
        responsavel_area: null,
        site: { id: 's1', nome: 'Obra 1' },
        ...overrides,
      };
    }

    it('NC com risco alto => critical', async () => {
      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({ risco_nivel: 'alto' }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('critical');
    });

    it('NC com risco critico => critical', async () => {
      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({ risco_nivel: 'critico' }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('critical');
    });

    it('NC com prazo vencido => critical independente do nivel de risco', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({
          risco_nivel: 'baixo',
          acao_definitiva_prazo: yesterday.toISOString(),
        }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('critical');
    });

    it('NC com risco medio => high', async () => {
      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({ risco_nivel: 'medio' }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('high');
    });

    it('NC com risco baixo sem prazo vencido => medium', async () => {
      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({ risco_nivel: 'baixo' }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('medium');
    });

    it('NC sem nivel de risco e sem prazo => medium', async () => {
      const nonConformities = createMockRepo();
      nonConformities.queryBuilder.getMany.mockResolvedValueOnce([
        makeNc({ risco_nivel: null }),
      ]);

      const { service } = createService({ nonConformities });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'NC');
      expect(item?.priority).toBe('medium');
    });
  });

  describe('prioridade de treinamentos', () => {
    function makeTraining(
      overrides: Partial<{
        id: string;
        nome: string;
        data_vencimento: Date;
        bloqueia_operacao_quando_vencido: boolean;
      }>,
    ) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      return {
        id: 'training-1',
        nome: 'NR-35',
        data_vencimento: futureDate,
        bloqueia_operacao_quando_vencido: false,
        user: { nome: 'Funcionario' },
        ...overrides,
      };
    }

    it('treinamento vencido que bloqueia operacao => critical', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const trainings = createMockRepo();
      trainings.queryBuilder.getMany.mockResolvedValueOnce([
        makeTraining({
          data_vencimento: past,
          bloqueia_operacao_quando_vencido: true,
        }),
      ]);

      const { service } = createService({ trainings });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'Treinamento');
      expect(item?.priority).toBe('critical');
    });

    it('treinamento vencido sem bloqueio => high', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const trainings = createMockRepo();
      trainings.queryBuilder.getMany.mockResolvedValueOnce([
        makeTraining({
          data_vencimento: past,
          bloqueia_operacao_quando_vencido: false,
        }),
      ]);

      const { service } = createService({ trainings });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'Treinamento');
      expect(item?.priority).toBe('high');
    });

    it('treinamento vencendo em 5 dias => high', async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 5);

      const trainings = createMockRepo();
      trainings.queryBuilder.getMany.mockResolvedValueOnce([
        makeTraining({ data_vencimento: soon }),
      ]);

      const { service } = createService({ trainings });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'Treinamento');
      expect(item?.priority).toBe('high');
    });

    it('treinamento vencendo em 10 dias => medium', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);

      const trainings = createMockRepo();
      trainings.queryBuilder.getMany.mockResolvedValueOnce([
        makeTraining({ data_vencimento: future }),
      ]);

      const { service } = createService({ trainings });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'Treinamento');
      expect(item?.priority).toBe('medium');
    });
  });

  describe('prioridade de exames medicos (ASO)', () => {
    function makeMedicalExam(
      overrides: Partial<{
        id: string;
        tipo_exame: string;
        resultado: string;
        data_vencimento: Date | null;
      }>,
    ) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      return {
        id: 'exam-1',
        tipo_exame: 'periodico',
        resultado: 'apto',
        data_vencimento: futureDate,
        user: { nome: 'Funcionario' },
        ...overrides,
      };
    }

    it('exame com resultado inapto => critical', async () => {
      const medicalExams = createMockRepo();
      medicalExams.queryBuilder.getMany.mockResolvedValueOnce([
        makeMedicalExam({ resultado: 'inapto' }),
      ]);

      const { service } = createService({ medicalExams });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'ASO');
      expect(item?.priority).toBe('critical');
    });

    it('exame vencido => critical', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const medicalExams = createMockRepo();
      medicalExams.queryBuilder.getMany.mockResolvedValueOnce([
        makeMedicalExam({ data_vencimento: past }),
      ]);

      const { service } = createService({ medicalExams });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'ASO');
      expect(item?.priority).toBe('critical');
    });

    it('exame apto com vencimento futuro => high', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);

      const medicalExams = createMockRepo();
      medicalExams.queryBuilder.getMany.mockResolvedValueOnce([
        makeMedicalExam({ resultado: 'apto', data_vencimento: future }),
      ]);

      const { service } = createService({ medicalExams });
      const result = await service.getPendingQueue(DEFAULT_INPUT);

      const item = result.items.find((i) => i.module === 'ASO');
      expect(item?.priority).toBe('high');
    });
  });

  // ─── companyId vazio ───────────────────────────────────────────────────────

  it('retorna resposta vazia sem bater no banco quando companyId e vazio', async () => {
    const { service, aprsRepository } = createService();

    const result = await service.getPendingQueue({
      companyId: '',
      siteScope: 'all',
      isSuperAdmin: false,
    });

    expect(result.items).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(aprsRepository.find).not.toHaveBeenCalled();
  });

  it('retorna resposta vazia sem bater no banco quando escopo single nao tem siteId', async () => {
    const { service, aprsRepository } = createService();

    const result = await service.getPendingQueue({
      companyId: 'company-1',
      siteScope: 'single',
      siteId: undefined,
      isSuperAdmin: false,
    });

    expect(result.degraded).toBe(true);
    expect(result.failedSources).toContain('site-scope');
    expect(result.items).toHaveLength(0);
    expect(aprsRepository.find).not.toHaveBeenCalled();
  });
});
