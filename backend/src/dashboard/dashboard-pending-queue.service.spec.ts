import { DashboardPendingQueueService } from './dashboard-pending-queue.service';

type MockRepo = {
  find: jest.Mock;
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
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => queryBuilder),
    queryBuilder,
  };
}

describe('DashboardPendingQueueService', () => {
  it('usa consultas leves para PT, treinamentos e exames médicos', async () => {
    const aprsRepository = createMockRepo();
    const auditsRepository = createMockRepo();
    const checklistsRepository = createMockRepo();
    const inspectionsRepository = createMockRepo();
    const medicalExamsRepository = createMockRepo();
    const nonConformitiesRepository = createMockRepo();
    const ptsRepository = createMockRepo();
    const trainingsRepository = createMockRepo();

    ptsRepository.find.mockResolvedValueOnce([
      {
        id: 'pt-1',
        titulo: 'PT 1',
        status: 'Pendente',
        data_hora_fim: '2026-04-20T12:00:00.000Z',
        residual_risk: 'HIGH',
        site: { id: 'site-1', nome: 'Obra 1' },
        responsavel: { nome: 'Responsavel 1' },
      },
    ]);
    trainingsRepository.find.mockResolvedValueOnce([
      {
        id: 'training-1',
        nome: 'NR-35',
        data_vencimento: '2026-04-20T12:00:00.000Z',
        bloqueia_operacao_quando_vencido: true,
        user: { nome: 'Funcionario 1' },
      },
    ]);
    medicalExamsRepository.find.mockResolvedValueOnce([
      {
        id: 'exam-1',
        tipo_exame: 'periodico',
        resultado: 'apto',
        data_vencimento: '2026-04-20T12:00:00.000Z',
        user: { nome: 'Funcionario 1' },
      },
    ]);

    const service = new DashboardPendingQueueService(
      aprsRepository as never,
      auditsRepository as never,
      checklistsRepository as never,
      inspectionsRepository as never,
      medicalExamsRepository as never,
      nonConformitiesRepository as never,
      ptsRepository as never,
      trainingsRepository as never,
    );

    const result = await service.getPendingQueue('company-1');

    expect(result.degraded).toBe(false);
    expect(result.summary.total).toBeGreaterThanOrEqual(3);
    expect(ptsRepository.find).toHaveBeenCalledTimes(1);
    expect(trainingsRepository.find).toHaveBeenCalledTimes(1);
    expect(medicalExamsRepository.find).toHaveBeenCalledTimes(1);
    expect(ptsRepository.queryBuilder.getMany).not.toHaveBeenCalled();
    expect(trainingsRepository.queryBuilder.getMany).not.toHaveBeenCalled();
    expect(medicalExamsRepository.queryBuilder.getMany).not.toHaveBeenCalled();
  });

  it('inclui updated_at nas selecoes ordenadas por updated_at', async () => {
    const aprsRepository = createMockRepo();
    const auditsRepository = createMockRepo();
    const checklistsRepository = createMockRepo();
    const inspectionsRepository = createMockRepo();
    const medicalExamsRepository = createMockRepo();
    const nonConformitiesRepository = createMockRepo();
    const ptsRepository = createMockRepo();
    const trainingsRepository = createMockRepo();

    const service = new DashboardPendingQueueService(
      aprsRepository as never,
      auditsRepository as never,
      checklistsRepository as never,
      inspectionsRepository as never,
      medicalExamsRepository as never,
      nonConformitiesRepository as never,
      ptsRepository as never,
      trainingsRepository as never,
    );

    await service.getPendingQueue('company-1');

    expect(aprsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          updated_at: true,
        }),
      }),
    );
    expect(inspectionsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          updated_at: true,
        }),
      }),
    );
    expect(auditsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          updated_at: true,
        }),
      }),
    );
    expect(nonConformitiesRepository.queryBuilder.select).toHaveBeenCalledWith(
      expect.arrayContaining(['nc.updated_at']),
    );
  });
});
