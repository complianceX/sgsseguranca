/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AprApprovalStepStatus } from './entities/apr-approval-step.entity';
import { AprStatus } from './entities/apr.entity';
import { ApprovalRecordAction } from './entities/apr-approval-record.entity';
import { AprWorkflowService } from './aprs-workflow.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    apr_id: 'apr-1',
    level_order: 1,
    title: 'Validação técnica SST',
    approver_role: 'Técnico de Segurança do Trabalho (TST)',
    status: AprApprovalStepStatus.PENDING,
    approver_user_id: null,
    decision_reason: null,
    decided_ip: null,
    decided_at: null,
    ...overrides,
  };
}

function makeApr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apr-1',
    company_id: 'company-1',
    site_id: 'site-1',
    status: AprStatus.PENDENTE,
    versao: 1,
    pdf_file_key: null,
    itens_risco: [],
    participants: [],
    risk_items: [],
    approval_steps: [],
    ...overrides,
  };
}

function buildManagerWithQueries(
  participantCount: number,
  riskItemRow: {
    count: string;
    sem_atividade: string;
    sem_agente: string;
    sem_medidas: string;
    sem_responsavel: string;
  } = {
    count: '1',
    sem_atividade: '0',
    sem_agente: '0',
    sem_medidas: '0',
    sem_responsavel: '0',
  },
  steps: ReturnType<typeof makeStep>[] = [],
) {
  const stepRepo = {
    find: jest.fn(() => Promise.resolve(steps)),
    save: jest.fn((payload: unknown) => Promise.resolve(payload)),
    create: jest.fn((input: unknown) => input),
  };

  const aprRepo = {
    save: jest.fn((apr: unknown) => Promise.resolve(apr)),
    create: jest.fn((input: unknown) => input),
  };

  return {
    query: jest
      .fn()
      .mockResolvedValueOnce([{ count: String(participantCount) }])
      .mockResolvedValueOnce([riskItemRow]),
    getRepository: jest.fn((entity: { name?: string }) => {
      if (entity?.name === 'AprApprovalStep') return stepRepo;
      return aprRepo;
    }),
    stepRepo,
    aprRepo,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('AprWorkflowService', () => {
  let aprsRepository: { manager: { transaction: jest.Mock; query: jest.Mock } };
  let aprLogsRepository: { create: jest.Mock; save: jest.Mock };
  let approvalRecordRepo: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let tenantService: { getTenantId: jest.Mock };
  let forensicTrailService: { append: jest.Mock };
  let service: AprWorkflowService;

  beforeEach(() => {
    jest.clearAllMocks();

    aprsRepository = {
      manager: {
        transaction: jest.fn(),
        query: jest.fn(),
      },
    };

    aprLogsRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(),
    };

    approvalRecordRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      create: jest.fn((input) => input),
    };

    tenantService = { getTenantId: jest.fn().mockReturnValue('company-1') };
    forensicTrailService = { append: jest.fn() };

    service = new AprWorkflowService(
      aprsRepository as never,
      aprLogsRepository as never,
      approvalRecordRepo as never,
      tenantService as never,
      forensicTrailService as never,
    );
  });

  // ─── executeAprWorkflowTransition ────────────────────────────────────────

  describe('executeAprWorkflowTransition', () => {
    it('lança InternalServerErrorException quando tenant está ausente', async () => {
      tenantService.getTenantId.mockReturnValue(null);
      await expect(
        service.executeAprWorkflowTransition('apr-1', async (apr) => apr),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('lança NotFoundException quando APR não existe no banco', async () => {
      aprsRepository.manager.transaction = jest.fn(async (fn) =>
        fn({
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest
            .fn()
            .mockReturnValue({ create: jest.fn((i) => i) }),
        }),
      );

      await expect(
        service.executeAprWorkflowTransition('nao-existe', async (apr) => apr),
      ).rejects.toThrow(NotFoundException);
    });

    it('executa a função dentro da transação quando APR existe', async () => {
      const row = {
        id: 'apr-1',
        company_id: 'company-1',
        status: AprStatus.PENDENTE,
      };
      const mockFn = jest.fn(async (apr) => apr);

      aprsRepository.manager.transaction = jest.fn(async (fn) =>
        fn({
          query: jest.fn().mockResolvedValue([row]),
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn((i) => i),
            save: jest.fn((i) => Promise.resolve(i)),
          }),
        }),
      );

      await service.executeAprWorkflowTransition('apr-1', mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  // ─── assertAprReadyForApproval ────────────────────────────────────────────

  describe('assertAprReadyForApproval', () => {
    it('lança BadRequestException quando status não é PENDENTE', async () => {
      const apr = makeApr({ status: AprStatus.APROVADA });
      const manager = buildManagerWithQueries(1);

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('não está pronta para aprovação');
    });

    it('lança BadRequestException quando não há participantes', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(0);

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('pelo menos um participante');
    });

    it('lança BadRequestException quando não há itens de risco', async () => {
      const apr = makeApr({ itens_risco: [] });
      const manager = buildManagerWithQueries(1, {
        count: '0',
        sem_atividade: '0',
        sem_agente: '0',
        sem_medidas: '0',
        sem_responsavel: '0',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('pelo menos um item de risco estruturado');
    });

    it('lança BadRequestException quando item de risco está sem atividade', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(1, {
        count: '2',
        sem_atividade: '1',
        sem_agente: '0',
        sem_medidas: '0',
        sem_responsavel: '0',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('sem campo "Atividade"');
    });

    it('lança BadRequestException quando item de risco está sem agente ambiental', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(1, {
        count: '2',
        sem_atividade: '0',
        sem_agente: '1',
        sem_medidas: '0',
        sem_responsavel: '0',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('sem identificação do perigo');
    });

    it('lança BadRequestException quando item de risco está sem medidas de controle', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(1, {
        count: '2',
        sem_atividade: '0',
        sem_agente: '0',
        sem_medidas: '1',
        sem_responsavel: '0',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('sem medidas de controle');
    });

    it('lança BadRequestException quando item de risco está sem responsável', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(1, {
        count: '2',
        sem_atividade: '0',
        sem_agente: '0',
        sem_medidas: '0',
        sem_responsavel: '1',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).rejects.toThrow('sem responsável');
    });

    it('aceita APR válida sem lançar exceção', async () => {
      const apr = makeApr();
      const manager = buildManagerWithQueries(1);

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).resolves.toBeUndefined();
    });

    it('aceita APR com risco apenas no legado itens_risco (count=0, legado>0)', async () => {
      const apr = makeApr({ itens_risco: [{ id: 'ri-1' }] });
      const manager = buildManagerWithQueries(1, {
        count: '0',
        sem_atividade: '0',
        sem_agente: '0',
        sem_medidas: '0',
        sem_responsavel: '0',
      });

      await expect(
        service.assertAprReadyForApproval(apr as never, manager as never),
      ).resolves.toBeUndefined();
    });
  });

  // ─── assertAprFormMutable ─────────────────────────────────────────────────

  describe('assertAprFormMutable', () => {
    it('lança BadRequestException quando APR não está pendente', () => {
      expect(() =>
        service.assertAprFormMutable({
          status: AprStatus.APROVADA,
          pdf_file_key: null,
        } as never),
      ).toThrow('Somente APRs pendentes podem ser editadas');
    });

    it('lança BadRequestException quando há aprovação em andamento', () => {
      const apr = makeApr({
        approval_steps: [makeStep({ status: AprApprovalStepStatus.APPROVED })],
      });
      expect(() => service.assertAprFormMutable(apr as never)).toThrow(
        'APR com aprovação em andamento',
      );
    });

    it('permite edição de APR pendente sem progresso de aprovação', () => {
      const apr = makeApr({
        approval_steps: [makeStep({ status: AprApprovalStepStatus.PENDING })],
      });
      expect(() => service.assertAprFormMutable(apr as never)).not.toThrow();
    });

    it('permite edição de APR pendente sem etapas', () => {
      expect(() =>
        service.assertAprFormMutable({
          status: AprStatus.PENDENTE,
          pdf_file_key: null,
        } as never),
      ).not.toThrow();
    });
  });

  // ─── assertAprRemovable ───────────────────────────────────────────────────

  describe('assertAprRemovable', () => {
    it('lança BadRequestException quando APR tem PDF final', () => {
      expect(() =>
        service.assertAprRemovable({
          status: AprStatus.PENDENTE,
          pdf_file_key: 'documents/apr-1.pdf',
        }),
      ).toThrow('sem PDF final');
    });

    it('lança BadRequestException quando APR está aprovada', () => {
      expect(() =>
        service.assertAprRemovable({
          status: AprStatus.APROVADA,
          pdf_file_key: null,
        } as never),
      ).toThrow('Somente APRs pendentes e sem PDF final');
    });

    it('lança BadRequestException quando APR está encerrada', () => {
      expect(() =>
        service.assertAprRemovable({
          status: AprStatus.ENCERRADA,
          pdf_file_key: null,
        } as never),
      ).toThrow('Somente APRs pendentes e sem PDF final');
    });

    it('lança BadRequestException quando APR tem aprovação em andamento', () => {
      const apr = makeApr({
        status: AprStatus.PENDENTE,
        pdf_file_key: null,
        approval_steps: [makeStep({ status: AprApprovalStepStatus.APPROVED })],
      });
      expect(() => service.assertAprRemovable(apr as never)).toThrow(
        'aprovação em andamento não pode ser removida',
      );
    });

    it('permite remoção de APR pendente sem PDF e sem progresso', () => {
      expect(() =>
        service.assertAprRemovable({
          status: AprStatus.PENDENTE,
          pdf_file_key: null,
        } as never),
      ).not.toThrow();
    });
  });

  // ─── assertAprWorkflowTransitionAllowed ──────────────────────────────────

  describe('assertAprWorkflowTransitionAllowed', () => {
    it('bloqueia mudança de status quando APR tem PDF final', () => {
      expect(() =>
        service.assertAprWorkflowTransitionAllowed({
          status: AprStatus.APROVADA,
          pdf_file_key: 'documents/apr.pdf',
        }),
      ).toThrow('PDF final emitido está bloqueada');
    });

    it('bloqueia mudança quando APR está encerrada', () => {
      expect(() =>
        service.assertAprWorkflowTransitionAllowed({
          status: AprStatus.ENCERRADA,
          pdf_file_key: null,
        } as never),
      ).toThrow('Não é possível alterar o fluxo');
    });

    it('bloqueia mudança quando APR está cancelada', () => {
      expect(() =>
        service.assertAprWorkflowTransitionAllowed({
          status: AprStatus.CANCELADA,
          pdf_file_key: null,
        } as never),
      ).toThrow('Não é possível alterar o fluxo');
    });

    it('permite mudança para APR pendente sem PDF', () => {
      expect(() =>
        service.assertAprWorkflowTransitionAllowed({
          status: AprStatus.PENDENTE,
          pdf_file_key: null,
        } as never),
      ).not.toThrow();
    });
  });

  // ─── assertAprReadyForFinalization ───────────────────────────────────────

  describe('assertAprReadyForFinalization', () => {
    it('lança BadRequestException quando APR não está aprovada', () => {
      expect(() =>
        service.assertAprReadyForFinalization({ status: AprStatus.CANCELADA }),
      ).toThrow('não está pronta para ser encerrada');
    });

    it('lança BadRequestException quando APR está pendente', () => {
      expect(() =>
        service.assertAprReadyForFinalization({ status: AprStatus.PENDENTE }),
      ).toThrow('não está pronta para ser encerrada');
    });

    it('aceita APR aprovada', () => {
      expect(() =>
        service.assertAprReadyForFinalization({ status: AprStatus.APROVADA }),
      ).not.toThrow();
    });
  });

  // ─── reject ──────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('lança BadRequestException quando motivo está ausente', async () => {
      await expect(service.reject('apr-1', 'user-1', '')).rejects.toThrow(
        'Motivo de reprovação obrigatório',
      );
    });

    it('lança BadRequestException quando motivo tem menos de 10 caracteres', async () => {
      await expect(service.reject('apr-1', 'user-1', 'curto')).rejects.toThrow(
        'Motivo de reprovação obrigatório com mínimo de 10 caracteres',
      );
    });

    it('define status SKIPPED para etapas futuras ao reprovar', async () => {
      const steps = [
        makeStep({
          id: 'step-1',
          level_order: 1,
          status: AprApprovalStepStatus.PENDING,
        }),
        makeStep({
          id: 'step-2',
          level_order: 2,
          status: AprApprovalStepStatus.PENDING,
        }),
        makeStep({
          id: 'step-3',
          level_order: 3,
          status: AprApprovalStepStatus.PENDING,
        }),
      ];
      const savedSteps: unknown[] = [];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
            {
              query: jest.fn(),
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest.fn(() => Promise.resolve(steps)),
                    save: jest.fn((payload: unknown) => {
                      const arr = Array.isArray(payload) ? payload : [payload];
                      savedSteps.push(...arr);
                      return Promise.resolve(payload);
                    }),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((i: unknown) => Promise.resolve(i)),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      await service.reject('apr-1', 'user-1', 'Motivo de reprovação válido', {
        roleName: 'Técnico de Segurança do Trabalho (TST)',
      });

      const skipped = (
        savedSteps as Array<{ status: AprApprovalStepStatus; id: string }>
      ).filter((s) => s.status === AprApprovalStepStatus.SKIPPED);
      expect(skipped.length).toBeGreaterThanOrEqual(2);
    });

    it('registra trilha forense ao reprovar', async () => {
      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
            {
              query: jest.fn(),
              getRepository: jest.fn().mockReturnValue({
                find: jest.fn(() => Promise.resolve([])),
                save: jest.fn((i: unknown) => Promise.resolve(i)),
                create: jest.fn((i: unknown) => i),
              }),
            } as never,
          ),
        );

      await service.reject('apr-1', 'user-1', 'Motivo suficientemente longo');
      expect(forensicTrailService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: expect.stringContaining('CANCEL'),
        }),
        expect.any(Object),
      );
    });
  });

  // ─── approve ─────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('lança BadRequestException quando ator de cargo errado tenta aprovar', async () => {
      const steps = [
        makeStep({
          approver_role: 'Técnico de Segurança do Trabalho (TST)',
          status: AprApprovalStepStatus.PENDING,
        }),
      ];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
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
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest.fn(() => Promise.resolve(steps)),
                    save: jest.fn((i: unknown) => Promise.resolve(i)),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((i: unknown) => Promise.resolve(i)),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      await expect(
        service.approve('apr-1', 'user-1', 'ok', {
          roleName: 'Supervisor / Encarregado',
        }),
      ).rejects.toThrow('A próxima etapa de aprovação exige o perfil');
    });

    it('aprova parcialmente mantendo status PENDENTE quando etapas restam', async () => {
      const steps = [
        makeStep({
          id: 'step-1',
          level_order: 1,
          status: AprApprovalStepStatus.PENDING,
        }),
        makeStep({
          id: 'step-2',
          level_order: 2,
          status: AprApprovalStepStatus.PENDING,
          approver_role: 'Supervisor / Encarregado',
        }),
      ];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
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
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest.fn(() => Promise.resolve(steps)),
                    save: jest.fn((i: unknown) => Promise.resolve(i)),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((apr: unknown) => Promise.resolve(apr)),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      const result = await service.approve('apr-1', 'user-tst', 'ok', {
        roleName: 'Técnico de Segurança do Trabalho (TST)',
      });

      expect(result.status).toBe(AprStatus.PENDENTE);
    });

    it('muda status para APROVADA quando todas etapas são concluídas', async () => {
      const steps = [
        makeStep({
          id: 'step-1',
          level_order: 1,
          status: AprApprovalStepStatus.PENDING,
        }),
      ];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
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
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest
                      .fn()
                      .mockResolvedValueOnce(steps)
                      .mockResolvedValueOnce([
                        { ...steps[0], status: AprApprovalStepStatus.APPROVED },
                      ]),
                    save: jest.fn((i: unknown) => Promise.resolve(i)),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((apr: unknown) =>
                    Promise.resolve({
                      ...(apr as object),
                      status: AprStatus.APROVADA,
                      aprovado_por_id: 'user-tst',
                    }),
                  ),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      const result = await service.approve('apr-1', 'user-tst', 'ok', {
        roleName: 'Técnico de Segurança do Trabalho (TST)',
      });

      expect(result.status).toBe(AprStatus.APROVADA);
    });

    it('permite aprovação privilegiada (ADMIN) sem verificar role da etapa', async () => {
      const steps = [makeStep({ status: AprApprovalStepStatus.PENDING })];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
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
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest
                      .fn()
                      .mockResolvedValueOnce(steps)
                      .mockResolvedValueOnce([
                        { ...steps[0], status: AprApprovalStepStatus.APPROVED },
                      ]),
                    save: jest.fn((i: unknown) => Promise.resolve(i)),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((apr: unknown) =>
                    Promise.resolve({
                      ...(apr as object),
                      status: AprStatus.APROVADA,
                      aprovado_por_id: 'admin-1',
                    }),
                  ),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      const result = await service.approve(
        'apr-1',
        'admin-1',
        'Aprovação gerencial',
        {
          roleName: 'Administrador da Empresa',
        },
      );

      expect(result.status).toBe(AprStatus.APROVADA);
    });

    it('cria etapas padrão quando APR não tem etapas configuradas', async () => {
      const createdSteps: unknown[] = [];

      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr() as never,
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
              getRepository: jest.fn((entity: { name?: string }) => {
                if (entity?.name === 'AprApprovalStep') {
                  return {
                    find: jest.fn().mockResolvedValue([]),
                    save: jest.fn((steps: unknown) => {
                      if (Array.isArray(steps)) createdSteps.push(...steps);
                      return Promise.resolve(steps);
                    }),
                    create: jest.fn((i: unknown) => i),
                  };
                }
                return {
                  save: jest.fn((i: unknown) =>
                    Promise.resolve({
                      ...(i as object),
                      status: AprStatus.PENDENTE,
                    }),
                  ),
                  create: jest.fn((i: unknown) => i),
                };
              }),
            } as never,
          ),
        );

      await service
        .approve('apr-1', 'user-tst', undefined, {
          roleName: 'Técnico de Segurança do Trabalho (TST)',
        })
        .catch(() => {
          /* step role mismatch OK here, we test step creation */
        });

      expect(createdSteps.length).toBeGreaterThan(0);
    });
  });

  // ─── finalize ────────────────────────────────────────────────────────────

  describe('finalize', () => {
    it('encerra APR aprovada com PDF já emitido', async () => {
      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(
            makeApr({
              status: AprStatus.APROVADA,
              pdf_file_key: 'docs/apr.pdf',
            }) as never,
            {
              getRepository: jest.fn().mockReturnValue({
                save: jest.fn((i: unknown) =>
                  Promise.resolve({
                    ...(i as object),
                    status: AprStatus.ENCERRADA,
                  }),
                ),
                create: jest.fn((i: unknown) => i),
              }),
            } as never,
          ),
        );

      const result = await service.finalize('apr-1', 'user-1');
      expect(result.status).toBe(AprStatus.ENCERRADA);
    });

    it('lança BadRequestException quando tenta encerrar APR pendente', async () => {
      jest
        .spyOn(service, 'executeAprWorkflowTransition')
        .mockImplementation(async (_id, fn) =>
          fn(makeApr() as never, {} as never),
        );

      await expect(service.finalize('apr-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── addLog ───────────────────────────────────────────────────────────────

  describe('addLog', () => {
    it('persiste log no repositório', async () => {
      aprLogsRepository.save.mockResolvedValue(undefined);
      await service.addLog('apr-1', 'user-1', 'APR_APROVADA' as never);
      expect(aprLogsRepository.save).toHaveBeenCalledTimes(1);
    });

    it('silencia erros de persistência sem relançar', async () => {
      aprLogsRepository.save.mockRejectedValue(new Error('db error'));
      await expect(
        service.addLog('apr-1', 'user-1', 'APR_APROVADA' as never),
      ).resolves.toBeUndefined();
    });
  });

  // ─── buildAprTraceMetadata ────────────────────────────────────────────────

  describe('buildAprTraceMetadata', () => {
    it('conta corretamente participantes, itens e etapas', () => {
      const apr = makeApr({
        participants: [{ id: 'u-1' }, { id: 'u-2' }],
        risk_items: [{ id: 'ri-1' }],
        approval_steps: [makeStep()],
      });

      const meta = service.buildAprTraceMetadata(apr as never);
      expect(meta.participantCount).toBe(2);
      expect(meta.riskItemCount).toBe(1);
      expect(meta.approvalStepCount).toBe(1);
    });

    it('usa itens_risco legado quando risk_items não está presente', () => {
      const apr = {
        id: 'apr-1',
        company_id: 'company-1',
        status: AprStatus.PENDENTE,
        versao: 1,
        site_id: 'site-1',
        itens_risco: [{ id: 'ri-1' }, { id: 'ri-2' }],
        participants: [],
        approval_steps: [],
      };

      const meta = service.buildAprTraceMetadata(apr as never);
      expect(meta.riskItemCount).toBe(2);
    });

    it('retorna zeros quando arrays são nulos/undefined', () => {
      const apr = {
        id: 'apr-1',
        company_id: 'company-1',
        status: AprStatus.PENDENTE,
        versao: 1,
        site_id: null,
      };

      const meta = service.buildAprTraceMetadata(apr as never);
      expect(meta.participantCount).toBe(0);
      expect(meta.riskItemCount).toBe(0);
      expect(meta.approvalStepCount).toBe(0);
    });
  });

  // ─── ensureAprStatus ─────────────────────────────────────────────────────

  describe('ensureAprStatus', () => {
    it('retorna status válido quando reconhecido', () => {
      expect(service.ensureAprStatus('Aprovada')).toBe(AprStatus.APROVADA);
      expect(service.ensureAprStatus('Pendente')).toBe(AprStatus.PENDENTE);
      expect(service.ensureAprStatus('Cancelada')).toBe(AprStatus.CANCELADA);
      expect(service.ensureAprStatus('Encerrada')).toBe(AprStatus.ENCERRADA);
    });

    it('retorna PENDENTE como fallback para status desconhecido', () => {
      expect(service.ensureAprStatus('StatusInvalido')).toBe(
        AprStatus.PENDENTE,
      );
      expect(service.ensureAprStatus(null)).toBe(AprStatus.PENDENTE);
      expect(service.ensureAprStatus(undefined)).toBe(AprStatus.PENDENTE);
    });
  });

  // ─── getWorkflowStatus ────────────────────────────────────────────────────

  describe('getWorkflowStatus', () => {
    it('retorna canEdit=true para APR pendente sem histórico', async () => {
      approvalRecordRepo.find.mockResolvedValue([]);
      const apr = makeApr({ workflowConfigId: null });

      const result = await service.getWorkflowStatus(apr as never, 'user-1');

      expect(result.canEdit).toBe(true);
      expect(result.currentStep).toBeNull();
      expect(result.canApprove).toBe(false);
    });

    it('retorna canEdit=false para APR com status aprovado', async () => {
      approvalRecordRepo.find.mockResolvedValue([]);
      const apr = makeApr({
        status: AprStatus.APROVADA,
        workflowConfigId: null,
      });

      const result = await service.getWorkflowStatus(apr as never, 'user-1');

      expect(result.canEdit).toBe(false);
    });

    it('retorna histórico de aprovação ordenado', async () => {
      const records = [
        {
          aprId: 'apr-1',
          action: ApprovalRecordAction.APROVADO,
          stepOrder: 1,
          occurredAt: new Date(),
        },
        {
          aprId: 'apr-1',
          action: ApprovalRecordAction.APROVADO,
          stepOrder: 2,
          occurredAt: new Date(),
        },
      ];
      approvalRecordRepo.find.mockResolvedValue(records);
      const apr = makeApr({ workflowConfigId: null });

      const result = await service.getWorkflowStatus(apr as never, 'user-1');

      expect(result.history).toHaveLength(2);
    });
  });

  // ─── processApproval ─────────────────────────────────────────────────────

  describe('processApproval', () => {
    it('lança BadRequestException quando APR não tem workflow configurável', async () => {
      const apr = makeApr({ workflowConfigId: null });

      await expect(
        service.processApproval(
          apr as never,
          'user-1',
          null,
          ApprovalRecordAction.APROVADO,
        ),
      ).rejects.toThrow('não possui workflow configurável');
    });

    it('lança BadRequestException quando motivo ausente ao reprovar', async () => {
      const apr = makeApr({ workflowConfigId: 'wf-1' });

      await expect(
        service.processApproval(
          apr as never,
          'user-1',
          null,
          ApprovalRecordAction.REPROVADO,
          '',
        ),
      ).rejects.toThrow('Motivo obrigatório');
    });
  });

  // ─── resolveAndAssignWorkflow ─────────────────────────────────────────────

  describe('resolveAndAssignWorkflow', () => {
    it('retorna null quando workflowResolver não está disponível', async () => {
      const apr = makeApr();
      const result = await service.resolveAndAssignWorkflow(apr as never);
      expect(result).toBeNull();
    });

    it('retorna null quando resolver lança exceção', async () => {
      const mockResolver = {
        resolveWorkflow: jest.fn().mockRejectedValue(new Error('timeout')),
        isFallback: jest.fn(),
      };

      const svcWithResolver = new AprWorkflowService(
        aprsRepository as never,
        aprLogsRepository as never,
        approvalRecordRepo as never,
        tenantService as never,
        forensicTrailService as never,
        mockResolver as never,
      );

      const result = await svcWithResolver.resolveAndAssignWorkflow(
        makeApr() as never,
      );
      expect(result).toBeNull();
    });

    it('retorna null quando resolver retorna config de fallback', async () => {
      const fakeConfig = { id: 'fallback-config' };
      const mockResolver = {
        resolveWorkflow: jest.fn().mockResolvedValue(fakeConfig),
        isFallback: jest.fn().mockReturnValue(true),
      };

      const svcWithResolver = new AprWorkflowService(
        aprsRepository as never,
        aprLogsRepository as never,
        approvalRecordRepo as never,
        tenantService as never,
        forensicTrailService as never,
        mockResolver as never,
      );

      const result = await svcWithResolver.resolveAndAssignWorkflow(
        makeApr() as never,
      );
      expect(result).toBeNull();
    });

    it('retorna id do config quando resolver encontra config válida', async () => {
      const fakeConfig = { id: 'wf-config-1' };
      const mockResolver = {
        resolveWorkflow: jest.fn().mockResolvedValue(fakeConfig),
        isFallback: jest.fn().mockReturnValue(false),
      };

      const svcWithResolver = new AprWorkflowService(
        aprsRepository as never,
        aprLogsRepository as never,
        approvalRecordRepo as never,
        tenantService as never,
        forensicTrailService as never,
        mockResolver as never,
      );

      const result = await svcWithResolver.resolveAndAssignWorkflow(
        makeApr() as never,
      );
      expect(result).toBe('wf-config-1');
    });
  });
});
