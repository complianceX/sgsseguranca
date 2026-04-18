import {
  AprApprovalStepStatus,
} from './entities/apr-approval-step.entity';
import { AprStatus } from './entities/apr.entity';
import { AprWorkflowService } from './aprs-workflow.service';

describe('AprWorkflowService', () => {
  const aprsRepository = {
    manager: {
      transaction: jest.fn(),
    },
  };
  const aprLogsRepository = {
    create: jest.fn((payload) => payload),
    save: jest.fn(),
  };
  const tenantService = {
    getTenantId: jest.fn(),
  };
  const forensicTrailService = {
    append: jest.fn(),
  };

  let service: AprWorkflowService;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantService.getTenantId.mockReturnValue('company-1');
    service = new AprWorkflowService(
      aprsRepository as never,
      aprLogsRepository as never,
      { find: jest.fn().mockResolvedValue([]), save: jest.fn(), create: jest.fn((p) => p) } as never,
      tenantService as never,
      forensicTrailService as never,
    );
  });

  it('permite aprovação parcial por TST sem mudar APR para aprovada', async () => {
    let steps = [
      {
        id: 'step-1',
        apr_id: 'apr-1',
        level_order: 1,
        title: 'Validação técnica SST',
        approver_role: 'Técnico de Segurança do Trabalho (TST)',
        status: AprApprovalStepStatus.PENDING,
      },
      {
        id: 'step-2',
        apr_id: 'apr-1',
        level_order: 2,
        title: 'Liberação da supervisão operacional',
        approver_role: 'Supervisor / Encarregado',
        status: AprApprovalStepStatus.PENDING,
      },
    ];

    jest
      .spyOn(service, 'executeAprWorkflowTransition')
      .mockImplementation(async (_id, fn) =>
        fn(
          {
            id: 'apr-1',
            company_id: 'company-1',
            site_id: 'site-1',
            status: AprStatus.PENDENTE,
            versao: 1,
            pdf_file_key: null,
            itens_risco: [],
            participants: [],
            risk_items: [],
          } as never,
          {
            query: jest
              .fn()
              .mockResolvedValueOnce([{ count: '1' }])
              .mockResolvedValueOnce([
                {
                  count: '1',
                  sem_atividade: '0',
                  sem_agente: '0',
                  sem_medidas: '0',
                  sem_responsavel: '0',
                },
              ]),
            getRepository: (entity: { name?: string }) => {
              if (entity?.name === 'AprApprovalStep') {
                return {
                  find: jest.fn(() => Promise.resolve(steps)),
                  save: jest.fn((payload) => {
                    if (Array.isArray(payload)) {
                      steps = payload;
                      return Promise.resolve(payload);
                    }
                    steps = steps.map((step) =>
                      step.id === payload.id ? { ...step, ...payload } : step,
                    );
                    return Promise.resolve(payload);
                  }),
                  create: jest.fn((input) => input),
                };
              }

              return {
                save: async (apr: { status: AprStatus }) => apr,
                create: jest.fn((input) => input),
              };
            },
          } as never,
        ),
      );

    const result = await service.approve(
      'apr-1',
      'user-1',
      'Validação técnica concluída',
      {
        roleName: 'Técnico de Segurança do Trabalho (TST)',
        ipAddress: '10.0.0.1',
      },
    );

    expect(result.status).toBe(AprStatus.PENDENTE);
    expect(aprLogsRepository.save).toHaveBeenCalled();
  });

  it('permite aprovação privilegiada e conclui todas as etapas', async () => {
    let steps = [
      {
        id: 'step-1',
        apr_id: 'apr-1',
        level_order: 1,
        title: 'Validação técnica SST',
        approver_role: 'Técnico de Segurança do Trabalho (TST)',
        status: AprApprovalStepStatus.PENDING,
      },
      {
        id: 'step-2',
        apr_id: 'apr-1',
        level_order: 2,
        title: 'Liberação da supervisão operacional',
        approver_role: 'Supervisor / Encarregado',
        status: AprApprovalStepStatus.PENDING,
      },
    ];

    jest
      .spyOn(service, 'executeAprWorkflowTransition')
      .mockImplementation(async (_id, fn) =>
        fn(
          {
            id: 'apr-1',
            company_id: 'company-1',
            site_id: 'site-1',
            status: AprStatus.PENDENTE,
            versao: 3,
            pdf_file_key: null,
            itens_risco: [],
            participants: [],
            risk_items: [],
          } as never,
          {
            query: jest
              .fn()
              .mockResolvedValueOnce([{ count: '1' }])
              .mockResolvedValueOnce([
                {
                  count: '1',
                  sem_atividade: '0',
                  sem_agente: '0',
                  sem_medidas: '0',
                  sem_responsavel: '0',
                },
              ]),
            getRepository: (entity: { name?: string }) => {
              if (entity?.name === 'AprApprovalStep') {
                return {
                  find: jest.fn(() => Promise.resolve(steps)),
                  save: jest.fn((payload) => {
                    if (Array.isArray(payload)) {
                      steps = payload;
                      return Promise.resolve(payload);
                    }
                    steps = steps.map((step) =>
                      step.id === payload.id ? { ...step, ...payload } : step,
                    );
                    return Promise.resolve(payload);
                  }),
                  create: jest.fn((input) => input),
                };
              }

              return {
                save: async (apr: {
                  status: AprStatus;
                  aprovado_por_id?: string;
                }) => apr,
                create: jest.fn((input) => input),
              };
            },
          } as never,
        ),
      );

    const result = await service.approve(
      'apr-1',
      'admin-1',
      'Aprovação gerencial',
      {
        roleName: 'Administrador da Empresa',
        ipAddress: '10.0.0.2',
      },
    );

    expect(result.status).toBe(AprStatus.APROVADA);
    expect(result.aprovado_por_id).toBe('admin-1');
    expect(aprLogsRepository.save).toHaveBeenCalled();
  });

  it('permite encerrar APR aprovada mesmo após emissão do PDF final', async () => {
    jest
      .spyOn(service, 'executeAprWorkflowTransition')
      .mockImplementation(async (_id, fn) =>
        fn(
          {
            id: 'apr-1',
            company_id: 'company-1',
            site_id: 'site-1',
            status: AprStatus.APROVADA,
            versao: 3,
            pdf_file_key: 'documents/apr-final.pdf',
            participants: [],
            risk_items: [],
          } as never,
          {
            getRepository: () => ({
              save: async (apr: { status: AprStatus }) => ({
                ...apr,
                id: 'apr-1',
                company_id: 'company-1',
                site_id: 'site-1',
                versao: 3,
                participants: [],
                risk_items: [],
              }),
            }),
          } as never,
        ),
      );

    const result = await service.finalize('apr-1', 'user-1');

    expect(result.status).toBe(AprStatus.ENCERRADA);
    expect(aprLogsRepository.save).toHaveBeenCalled();
  });

  it('mantém bloqueio para encerrar APR fora do estado aprovado', () => {
    expect(() =>
      service.assertAprReadyForFinalization({
        status: AprStatus.CANCELADA,
      }),
    ).toThrow('não está pronta para ser encerrada');
  });
});
