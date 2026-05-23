import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AprWorkflowConfigsController } from './apr-workflow-configs.controller';
import { AprWorkflowConfig } from '../entities/apr-workflow-config.entity';
import { AprWorkflowStep } from '../entities/apr-workflow-step.entity';
import { Site } from '../../sites/entities/site.entity';
import { WorkflowCriticality } from '../entities/apr-workflow-config.entity';

describe('AprWorkflowConfigsController', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const siteId = '22222222-2222-4222-8222-222222222222';
  const configId = '33333333-3333-4333-8333-333333333333';

  function buildController(siteExists = true) {
    const siteRepo = {
      exist: jest.fn<
        Promise<boolean>,
        [{ where: { id: string; company_id: string } }]
      >(),
    };
    siteRepo.exist.mockResolvedValue(siteExists);

    const configScopedRepo = {
      create: jest.fn<AprWorkflowConfig, [Partial<AprWorkflowConfig>]>(
        (input) => ({ ...input }) as AprWorkflowConfig,
      ),
      save: jest.fn<Promise<AprWorkflowConfig>, [Partial<AprWorkflowConfig>]>(
        (input) =>
          Promise.resolve({ id: configId, ...input } as AprWorkflowConfig),
      ),
      findOne: jest.fn<Promise<AprWorkflowConfig | null>, [unknown]>(),
      findOneOrFail: jest.fn<Promise<AprWorkflowConfig>, [unknown]>(),
    };
    configScopedRepo.findOne.mockResolvedValue(null);
    configScopedRepo.findOneOrFail.mockResolvedValue({
      id: configId,
      tenantId,
      siteId,
      activityType: 'APR',
      criticality: WorkflowCriticality.ALTA,
      name: 'Workflow APR',
      isDefault: true,
      isActive: true,
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      steps: [],
    } as AprWorkflowConfig);

    const stepRepo = {
      create: jest.fn<AprWorkflowStep, [Partial<AprWorkflowStep>]>(
        (input) => ({ ...input }) as AprWorkflowStep,
      ),
      save: jest.fn<Promise<AprWorkflowStep[]>, [AprWorkflowStep[]]>((input) =>
        Promise.resolve(input),
      ),
      delete: jest.fn<Promise<void>, [unknown]>(() => Promise.resolve()),
    };
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === Site.name) return siteRepo;
        if (entity?.name === AprWorkflowConfig.name) return configScopedRepo;
        if (entity?.name === AprWorkflowStep.name) return stepRepo;
        throw new Error(`Unexpected repository: ${entity?.name ?? 'unknown'}`);
      }),
    };
    const entityManager = {
      getRepository: manager.getRepository,
      transaction: jest.fn(
        (callback: (repoManager: typeof manager) => unknown) =>
          Promise.resolve(callback(manager)),
      ),
    };
    const configRepo = {
      manager: entityManager,
      update: jest.fn<Promise<void>, [unknown, unknown]>(() =>
        Promise.resolve(),
      ),
      find: jest
        .fn<Promise<AprWorkflowConfig[]>, [unknown]>()
        .mockResolvedValue([]),
    };
    const tenantService = {
      getTenantId: jest.fn(() => tenantId),
    };

    return {
      controller: new AprWorkflowConfigsController(
        configRepo as never,
        tenantService as never,
      ),
      configRepo,
      configScopedRepo,
      stepRepo,
      siteRepo,
    };
  }

  it('usa o tenant autenticado e ignora tenantId enviado pelo cliente', async () => {
    const { controller, configScopedRepo, siteRepo, stepRepo } =
      buildController();

    const result = await controller.create({
      tenantId: '99999999-9999-4999-8999-999999999999',
      siteId,
      activityType: 'APR',
      criticality: WorkflowCriticality.ALTA,
      name: 'Workflow APR',
      isDefault: true,
      steps: [
        {
          stepOrder: 1,
          roleName: 'TECNICO_SST',
          isRequired: true,
          canDelegate: false,
          timeoutHours: 12,
        },
      ],
    } as never);

    expect(siteRepo.exist).toHaveBeenCalledWith({
      where: { id: siteId, company_id: tenantId },
    });
    expect(configScopedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        siteId,
        activityType: 'APR',
        criticality: WorkflowCriticality.ALTA,
        name: 'Workflow APR',
        isDefault: true,
        isActive: true,
      }),
    );
    expect(stepRepo.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        id: configId,
        tenantId,
        siteId,
      }),
    );
  });

  it('rejeita site que não pertence ao tenant atual', async () => {
    const { controller } = buildController(false);

    await expect(
      controller.create({
        siteId,
        name: 'Workflow APR',
        steps: [],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('faz lookup de workflow usando tenantId no where', async () => {
    const { controller, configScopedRepo } = buildController();
    configScopedRepo.findOne.mockResolvedValue({
      id: configId,
      tenantId,
      siteId,
      activityType: 'APR',
      criticality: WorkflowCriticality.ALTA,
      name: 'Workflow APR',
      isDefault: true,
      isActive: true,
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      steps: [],
    });

    await controller.findOne(configId);

    expect(configScopedRepo.findOne).toHaveBeenCalledWith({
      where: { id: configId, tenantId },
      relations: ['steps'],
    });
  });

  it('retorna 404 quando o workflow não existe para o tenant', async () => {
    const { controller, configScopedRepo } = buildController();
    configScopedRepo.findOne.mockResolvedValue(null);

    await expect(controller.findOne(configId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
