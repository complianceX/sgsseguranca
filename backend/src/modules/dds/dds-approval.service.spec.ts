import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Role } from '../auth/enums/roles.enum';
import { User } from '../users/entities/user.entity';
import { AuditResult, Dds, DdsStatus } from './entities/dds.entity';
import {
  DdsApprovalAction,
  DdsApprovalRecord,
} from './entities/dds-approval-record.entity';
import { DdsApprovalService } from './dds-approval.service';
import { Signature } from '../signatures/entities/signature.entity';

describe('DdsApprovalService', () => {
  const DDS_ID = '11111111-1111-4111-8111-111111111111';
  const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
  const TST_USER_ID = '33333333-3333-4333-8333-333333333333';
  const SUPERVISOR_USER_ID = '44444444-4444-4444-8444-444444444444';
  const ADMIN_EMPRESA_USER_ID = '55555555-5555-4555-8555-555555555555';

  let service: DdsApprovalService;
  let records: DdsApprovalRecord[];
  let currentDds: Dds;
  let ddsRepository: {
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: {
      getRepository: jest.Mock;
      transaction: jest.Mock;
    };
  };
  let ddsService: { findOne: jest.Mock };
  let signaturesService: { createWithManager: jest.Mock };
  let approvalRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager?: { getRepository: jest.Mock };
  };

  const actor = (userId = TST_USER_ID) => ({
    userId,
    ip: '127.0.0.1',
    userAgent: 'jest-dds-approval',
    pin: '1234',
  });

  const createUser = (id: string, role: Role) => ({
    id,
    company_id: COMPANY_ID,
    profile: { nome: role },
  });

  beforeEach(() => {
    records = [];
    currentDds = {
      id: DDS_ID,
      company_id: COMPANY_ID,
      status: DdsStatus.PUBLICADO,
      is_modelo: false,
      pdf_file_key: null,
    } as unknown as Dds;

    const users = new Map([
      [TST_USER_ID, createUser(TST_USER_ID, Role.TST)],
      [SUPERVISOR_USER_ID, createUser(SUPERVISOR_USER_ID, Role.SUPERVISOR)],
      [
        ADMIN_EMPRESA_USER_ID,
        createUser(ADMIN_EMPRESA_USER_ID, Role.ADMIN_EMPRESA),
      ],
    ]);

    const userRepository = {
      findOne: jest.fn(({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        return Promise.resolve(user || null);
      }),
    };

    approvalRepository = {
      find: jest.fn(() =>
        Promise.resolve(
          [...records].sort(
            (first, second) =>
              first.cycle - second.cycle ||
              first.level_order - second.level_order ||
              first.event_at.getTime() - second.event_at.getTime() ||
              first.created_at.getTime() - second.created_at.getTime(),
          ),
        ),
      ),
      findOne: jest.fn(
        ({
          where,
        }: {
          where: Partial<DdsApprovalRecord>;
          order?: Record<string, string>;
        }) => {
          if (where.id) {
            return Promise.resolve(
              records.find(
                (record) =>
                  record.id === where.id &&
                  record.dds_id === where.dds_id &&
                  record.company_id === where.company_id &&
                  record.action === where.action,
              ) || null,
            );
          }

          return Promise.resolve(records[records.length - 1] || null);
        },
      ),
      create: jest.fn((input: Partial<DdsApprovalRecord>) => ({
        ...input,
        created_at: new Date(),
      })),
      save: jest.fn((input: DdsApprovalRecord) => {
        const record = {
          ...input,
          id:
            input.id ||
            `66666666-6666-4666-8666-${String(records.length + 1).padStart(12, '0')}`,
          created_at: input.created_at || new Date(),
        } as DdsApprovalRecord;
        records.push(record);
        return Promise.resolve(record);
      }),
      manager: {
        getRepository: jest.fn(),
      },
    };
    signaturesService = {
      createWithManager: jest.fn(
        ({
          user_id,
          integrity_context,
        }: {
          user_id: string;
          integrity_context?: Record<string, unknown>;
        }) =>
          Promise.resolve({
            id: `signature-${records.length + 1}`,
            user_id,
            signature_hash: `signature-hash-${records.length + 1}`,
            timestamp_authority: 'authority-1',
            signed_at: new Date('2026-03-16T12:00:00.000Z'),
            integrity_payload: {
              signature_context: integrity_context,
            },
          } as unknown as Signature),
      ),
    };

    ddsRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(currentDds),
      })),
      manager: {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === DdsApprovalRecord) {
            return approvalRepository;
          }
          if (entity === Dds) {
            return ddsRepository;
          }
          if (entity === User) {
            return userRepository;
          }
          return userRepository;
        }),
        transaction: jest.fn(
          async (
            callback: (manager: {
              getRepository: jest.Mock;
            }) => Promise<unknown>,
          ) =>
            callback({
              getRepository: ddsRepository.manager.getRepository,
            } as { getRepository: jest.Mock }),
        ),
      },
    };
    ddsRepository.manager.getRepository.mockImplementation(
      (entity: unknown) => {
        if (entity === DdsApprovalRecord) {
          return approvalRepository;
        }
        if (entity === Dds) {
          return {
            ...ddsRepository,
            update: ddsRepository.update,
            createQueryBuilder: ddsRepository.createQueryBuilder,
          };
        }
        return userRepository;
      },
    );
    ddsService = {
      findOne: jest.fn(() => Promise.resolve(currentDds)),
    };

    const tenantService = { getTenantId: jest.fn(() => COMPANY_ID) };

    service = new DdsApprovalService(
      approvalRepository as never,
      ddsRepository as never,
      ddsService as never,
      signaturesService as never,
      tenantService as never,
    );
  });

  it('inicia fluxo padrão com três níveis e hash por evento', async () => {
    const flow = await service.initializeFlow(DDS_ID, {}, actor());

    expect(flow.status).toBe('pending');
    expect(flow.activeCycle).toBe(1);
    expect(flow.currentStep?.level_order).toBe(1);
    expect(flow.steps).toHaveLength(3);
    expect(flow.steps.map((step) => step.approver_role)).toEqual([
      Role.TST,
      Role.SUPERVISOR,
      Role.ADMIN_EMPRESA,
    ]);
    expect(flow.events.every((event) => event.event_hash)).toBe(true);
  });

  it('bloqueia aprovação fora da ordem e exige perfil RBAC da etapa', async () => {
    let flow = await service.initializeFlow(DDS_ID, {}, actor());
    const firstStepId = flow.currentStep!.pending_record_id!;
    const thirdStepId = flow.steps[2].pending_record_id!;

    await expect(
      service.approveStep(
        DDS_ID,
        firstStepId,
        undefined,
        actor(SUPERVISOR_USER_ID),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    flow = await service.approveStep(
      DDS_ID,
      firstStepId,
      'Conferência técnica validada.',
      actor(TST_USER_ID),
    );

    expect(flow.currentStep?.level_order).toBe(2);
    await expect(
      service.approveStep(
        DDS_ID,
        thirdStepId,
        undefined,
        actor(ADMIN_EMPRESA_USER_ID),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marca DDS como auditado quando todos os níveis aprovam', async () => {
    let flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));
    flow = await service.approveStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Técnico validou evidências.',
      actor(TST_USER_ID),
    );
    flow = await service.approveStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Liderança validou execução.',
      actor(SUPERVISOR_USER_ID),
    );
    flow = await service.approveStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Aprovado pela administração.',
      actor(ADMIN_EMPRESA_USER_ID),
    );

    expect(flow.status).toBe('approved');
    expect(ddsRepository.update).toHaveBeenCalledWith(
      DDS_ID,
      expect.objectContaining({
        status: DdsStatus.AUDITADO,
        auditado_por_id: ADMIN_EMPRESA_USER_ID,
        resultado_auditoria: AuditResult.CONFORME,
      }),
    );
    expect(signaturesService.createWithManager).toHaveBeenCalledTimes(3);
  });

  it('reabre fluxo reprovado em novo ciclo mantendo histórico', async () => {
    let flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));
    flow = await service.rejectStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Evidências insuficientes para aprovação.',
      actor(TST_USER_ID),
    );

    expect(flow.status).toBe('rejected');

    flow = await service.reopenFlow(
      DDS_ID,
      'DDS corrigido e reenviado para aprovação.',
      actor(TST_USER_ID),
    );

    expect(flow.status).toBe('pending');
    expect(flow.activeCycle).toBe(2);
    expect(
      flow.events.some((event) => event.action === DdsApprovalAction.REOPENED),
    ).toBe(true);
    expect(flow.currentStep?.level_order).toBe(1);
  });

  it('bloqueia fluxo para DDS em rascunho', async () => {
    currentDds.status = DdsStatus.RASCUNHO;

    await expect(service.initializeFlow(DDS_ID, {}, actor())).rejects.toThrow(
      'Publique o DDS antes de iniciar o fluxo de aprovação.',
    );
  });

  it('retorna conflito limpo quando uma decisão concorrente já gravou o evento', async () => {
    const flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));
    approvalRepository.save.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'IDX_dds_approval_records_decision_unique',
      } as never),
    );

    await expect(
      service.approveStep(
        DDS_ID,
        flow.currentStep!.pending_record_id!,
        'Conferência técnica validada.',
        actor(TST_USER_ID),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('vincula a decisão DDS a uma assinatura HMAC com contexto íntegro', async () => {
    const flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));

    await service.approveStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Conferência técnica validada.',
      actor(TST_USER_ID),
    );

    const [signaturePayload, authenticatedUserId, manager, signerUserId] =
      signaturesService.createWithManager.mock.calls[0] as [
        Record<string, unknown>,
        string,
        unknown,
        string,
      ];
    expect(signaturePayload).toMatchObject({
      document_id: DDS_ID,
      document_type: 'DDS',
      type: 'hmac',
      user_id: TST_USER_ID,
      pin: '1234',
      integrity_context: {
        scope: 'dds_approval_flow',
        approval_action: DdsApprovalAction.APPROVED,
        approval_cycle: 1,
        approval_level_order: 1,
      },
    });
    expect(authenticatedUserId).toBe(TST_USER_ID);
    expect(manager).toBeDefined();
    expect(signerUserId).toBe(TST_USER_ID);
    expect(records[records.length - 1]).toEqual(
      expect.objectContaining({
        actor_signature_id: 'signature-4',
        actor_signature_hash: 'signature-hash-4',
        actor_signature_timestamp_authority: 'authority-1',
      }),
    );
  });

  it('retorna status not_started quando nenhum fluxo foi inicializado', async () => {
    const flow = await service.getFlow(DDS_ID);
    expect(flow.status).toBe('not_started');
    expect(flow.currentStep).toBeNull();
    expect(flow.steps).toHaveLength(0);
  });

  it('rastreia hash de evento em cada decisão para integridade forensica', async () => {
    const flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));

    expect(
      flow.events.every((e) => e.event_hash && e.event_hash.length > 0),
    ).toBe(true);

    await service.approveStep(
      DDS_ID,
      flow.currentStep!.pending_record_id!,
      'Validado.',
      actor(TST_USER_ID),
    );

    const updatedFlow = await service.getFlow(DDS_ID);
    expect(updatedFlow.events).toHaveLength(4);
    expect(
      updatedFlow.events.every((event) => event.event_hash?.length > 0),
    ).toBe(true);

    const eventHashes = new Set(
      updatedFlow.events.map((event) => event.event_hash),
    );
    const rootEvents = updatedFlow.events.filter(
      (event) => event.previous_event_hash === null,
    );
    expect(rootEvents).toHaveLength(1);
    expect(
      updatedFlow.events
        .filter((event) => event.previous_event_hash !== null)
        .every((event) => eventHashes.has(event.previous_event_hash!)),
    ).toBe(true);
    expect(
      updatedFlow.events.find(
        (event) => event.action === DdsApprovalAction.APPROVED,
      )?.previous_event_hash,
    ).toBeTruthy();
  });

  it('bloqueia aprovacao com pin invalido (HMAC)', async () => {
    const flowWithoutPin = await service.initializeFlow(
      DDS_ID,
      {},
      {
        userId: TST_USER_ID,
        ip: '127.0.0.1',
        userAgent: 'jest',
        pin: undefined,
      },
    );

    await expect(
      service.approveStep(
        DDS_ID,
        flowWithoutPin.currentStep!.pending_record_id!,
        'Comentário.',
        { userId: TST_USER_ID, ip: '127.0.0.1', userAgent: 'jest', pin: '999' },
      ),
    ).rejects.toThrow();
  });

  it('marca DDS como auditado apenas quando ultimo nivel aprova', async () => {
    let flow = await service.initializeFlow(DDS_ID, {}, actor(TST_USER_ID));
    const step1Id = flow.currentStep!.pending_record_id!;

    flow = await service.approveStep(DDS_ID, step1Id, 'OK', actor(TST_USER_ID));
    expect(flow.status).toBe('pending');

    const step2Id = flow.currentStep!.pending_record_id!;
    flow = await service.approveStep(
      DDS_ID,
      step2Id,
      'OK',
      actor(SUPERVISOR_USER_ID),
    );
    expect(flow.status).toBe('pending');

    const step3Id = flow.currentStep!.pending_record_id!;
    flow = await service.approveStep(
      DDS_ID,
      step3Id,
      'OK',
      actor(ADMIN_EMPRESA_USER_ID),
    );
    expect(flow.status).toBe('approved');
  });
});
