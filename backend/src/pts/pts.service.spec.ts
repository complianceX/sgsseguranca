import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { PtsService } from './pts.service';
import { Pt, PtStatus } from './entities/pt.entity';
import { Company } from '../companies/entities/company.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { AuditService } from '../audit/audit.service';
import { WorkerOperationalStatusService } from '../users/worker-operational-status.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentBundleService } from '../common/services/document-bundle.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { SignaturesService } from '../signatures/signatures.service';
import { Site } from '../sites/entities/site.entity';
import { Apr } from '../aprs/entities/apr.entity';
import { User } from '../users/entities/user.entity';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import type { AppendForensicTrailEventInput } from '../forensic-trail/forensic-trail.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('PtsService', () => {
  let service: PtsService;
  let ptsRepository: jest.Mocked<Repository<Pt>>;
  let companiesRepository: jest.Mocked<Repository<Company>>;
  let auditLogsRepository: jest.Mocked<Repository<AuditLog>>;
  let ptsSaveMock: jest.Mock;
  let auditLogsFindMock: jest.Mock;
  let tenantService: Partial<TenantService>;
  let riskCalculationService: Partial<RiskCalculationService>;
  let auditService: Partial<AuditService>;
  let workerOperationalStatusService: Partial<WorkerOperationalStatusService>;
  let documentStorageService: Partial<DocumentStorageService>;
  let documentGovernanceService: Partial<DocumentGovernanceService>;
  let signaturesService: Partial<SignaturesService>;
  let forensicTrailService: Partial<ForensicTrailService>;
  let getRepositoryMock: jest.Mock;
  let defaultScopedRepository: {
    exist: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(() => {
    ptsSaveMock = jest.fn((input: Pt) => Promise.resolve(input));
    auditLogsFindMock = jest.fn();
    ptsRepository = {
      findOne: jest.fn(),
      save: ptsSaveMock,
      create: jest.fn((input: Partial<Pt>) => input),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      count: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Repository<Pt>>;
    companiesRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Company>>;
    auditLogsRepository = {
      find: auditLogsFindMock,
    } as unknown as jest.Mocked<Repository<AuditLog>>;
    tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
      getContext: jest.fn().mockReturnValue({
        companyId: 'company-1',
        siteScope: 'all',
        isSuperAdmin: false,
      }),
    };
    riskCalculationService = {
      calculateScore: jest.fn(),
      classifyByScore: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };
    workerOperationalStatusService = {
      getByUserIds: jest.fn().mockResolvedValue([]),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/pts/sites/site-1/pt-1/pt-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };
    const documentBundleService = {
      buildWeeklyPdfBundle: jest.fn(),
    };
    signaturesService = {
      findByDocument: jest.fn().mockResolvedValue([]),
    };
    forensicTrailService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    defaultScopedRepository = {
      exist: jest.fn().mockResolvedValue(true),
      count: jest
        .fn()
        .mockImplementation((opts?: { where?: { id?: string[] } }) => {
          const ids = opts?.where?.id;
          return Array.isArray(ids) ? ids.length : 0;
        }),
    };
    getRepositoryMock = jest.fn(() => defaultScopedRepository);
    (
      ptsRepository as unknown as {
        manager: { getRepository: jest.Mock; transaction: jest.Mock };
      }
    ).manager = {
      getRepository: getRepositoryMock,
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        Promise.resolve(
          callback({
            getRepository: jest.fn((entity: unknown) => {
              if (entity === Pt) {
                return {
                  create: jest.fn((input: Pt) => input),
                  save: jest.fn((input: Pt) => Promise.resolve(input)),
                };
              }
              return getRepositoryMock(entity) as {
                exist?: jest.Mock;
                count?: jest.Mock;
              };
            }),
            query: jest.fn(async (_sql: string, params?: unknown[]) => {
              const id = typeof params?.[0] === 'string' ? params[0] : '';
              const tenantId =
                typeof params?.[1] === 'string' ? params[1] : undefined;
              const pt = await ptsRepository.findOne({
                where: tenantId
                  ? ({ id, company_id: tenantId } as never)
                  : ({ id } as never),
              });
              return pt ? [pt] : [];
            }),
          }),
        ),
      ),
    };

    service = new PtsService(
      ptsRepository as unknown as Repository<Pt>,
      companiesRepository as unknown as Repository<Company>,
      auditLogsRepository as unknown as Repository<AuditLog>,
      tenantService as TenantService,
      riskCalculationService as RiskCalculationService,
      auditService as unknown as AuditService,
      workerOperationalStatusService as WorkerOperationalStatusService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentBundleService as unknown as DocumentBundleService,
      signaturesService as SignaturesService,
      forensicTrailService as ForensicTrailService,
    );
  });

  it('registra a pré-liberação no audit log com ação PRE_APPROVAL', async () => {
    const pt = {
      id: 'pt-1',
      numero: 'PT-001',
      titulo: 'Trabalho em altura',
      status: 'Pendente',
      company_id: 'company-1',
    } as unknown as Pt;

    ptsRepository.findOne.mockResolvedValue(pt);

    await service.logPreApprovalReview('pt-1', 'user-1', {
      stage: 'preview',
      readyForRelease: false,
      blockers: ['Selecionar ao menos um executante.'],
      unansweredChecklistItems: 2,
      adverseChecklistItems: 1,
      pendingSignatures: 1,
      hasRapidRiskBlocker: false,
      workerStatuses: [],
      warnings: [],
      rules: {
        blockCriticalRiskWithoutEvidence: true,
        blockWorkerWithoutValidMedicalExam: true,
        blockWorkerWithExpiredBlockingTraining: true,
        requireAtLeastOneExecutante: true,
      },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: AuditAction.PRE_APPROVAL,
        entity: 'PT',
        entityId: 'pt-1',
        companyId: 'company-1',
      }),
    );
  });

  it('retorna histórico de pré-liberação mapeado a partir do audit log', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
    } as unknown as Pt;

    const createdAt = new Date('2026-03-14T12:00:00.000Z');

    ptsRepository.findOne.mockResolvedValue(pt);
    auditLogsFindMock.mockResolvedValue([
      {
        id: 'audit-1',
        action: AuditAction.PRE_APPROVAL,
        userId: 'user-1',
        created_at: createdAt,
        timestamp: createdAt,
        after: {
          review: {
            stage: 'approval_requested',
            readyForRelease: true,
            blockers: [],
            unansweredChecklistItems: 0,
            adverseChecklistItems: 0,
            pendingSignatures: 0,
            hasRapidRiskBlocker: false,
            warnings: [],
            checklist: {
              reviewedReadiness: true,
              reviewedWorkers: true,
              confirmedRelease: true,
            },
          },
        },
      } as unknown as AuditLog,
    ]);

    const result = await service.getPreApprovalHistory('pt-1');
    const findCalls = auditLogsFindMock.mock.calls as unknown as Array<
      [
        {
          where?: {
            entity?: string;
            entityId?: string;
            action?: AuditAction;
            companyId?: string;
          };
        },
      ]
    >;
    const findArgs = findCalls[0]?.[0];

    expect(auditLogsFindMock).toHaveBeenCalledTimes(1);
    expect(findArgs?.where).toEqual(
      expect.objectContaining({
        entity: 'PT',
        entityId: 'pt-1',
        action: AuditAction.PRE_APPROVAL,
        companyId: 'company-1',
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        userId: 'user-1',
        stage: 'approval_requested',
        readyForRelease: true,
        checklist: {
          reviewedReadiness: true,
          reviewedWorkers: true,
          confirmedRelease: true,
        },
      }),
    ]);
  });

  it('anexa o PDF final da PT pela esteira central quando a PT ja esta aprovada', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as unknown as Pt;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    } as unknown as EntityManager;
    ptsRepository.findOne.mockResolvedValue(pt);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata?.(manager, 'hash-pt');
      return { hash: 'hash-pt', registryEntry: { id: 'registry-pt' } };
    });

    const file = {
      originalname: 'pt-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-pt'),
    } as Express.Multer.File;

    await expect(service.attachPdf('pt-1', file, 'user-1')).resolves.toEqual({
      fileKey: 'documents/company-1/pts/sites/site-1/pt-1/pt-final.pdf',
      folderPath: 'documents/company-1/pts/sites/site-1/pt-1',
      originalName: 'pt-final.pdf',
    });

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'pt',
        entityId: 'pt-1',
        documentCode: 'PT-2026-PT1',
        fileBuffer: file.buffer,
        createdBy: 'user-1',
      }),
    );
    expect(update).toHaveBeenCalledWith('pt-1', {
      pdf_file_key: 'documents/company-1/pts/sites/site-1/pt-1/pt-final.pdf',
      pdf_folder_path: 'documents/company-1/pts/sites/site-1/pt-1',
      pdf_original_name: 'pt-final.pdf',
    });
  });

  it('remove o arquivo do storage quando a governanca falha depois do upload da PT', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as unknown as Pt;
    ptsRepository.findOne.mockResolvedValue(pt);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    const file = {
      originalname: 'pt-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-pt'),
    } as Express.Multer.File;

    await expect(service.attachPdf('pt-1', file, 'user-1')).rejects.toThrow(
      'governance failed',
    );

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/pts/sites/site-1/pt-1/pt-final.pdf',
    );
  });

  it('falha imediatamente quando o storage governado da PT está indisponível', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as unknown as Pt;
    ptsRepository.findOne.mockResolvedValue(pt);
    (documentStorageService.uploadFile as jest.Mock).mockRejectedValue(
      new Error('S3 is not enabled'),
    );
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    const file = {
      originalname: 'pt-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-pt'),
    } as Express.Multer.File;

    await expect(service.attachPdf('pt-1', file, 'user-1')).rejects.toThrow(
      'S3 is not enabled',
    );

    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
    expect(documentStorageService.deleteFile).not.toHaveBeenCalled();
  });

  it('bloqueia o anexo final quando a PT ainda nao esta aprovada', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
    } as unknown as Pt);

    const file = {
      originalname: 'pt-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-pt'),
    } as Express.Multer.File;

    await expect(service.attachPdf('pt-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia edicao quando a PT ja possui PDF final', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.APROVADA,
      pdf_file_key: 'documents/company-1/pts/pt-1/pt-final.pdf',
    } as unknown as Pt);

    await expect(
      service.update('pt-1', { titulo: 'Novo titulo' }),
    ).rejects.toThrow(BadRequestException);

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia rejeicao quando a PT ja possui PDF final', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.APROVADA,
      pdf_file_key: 'documents/company-1/pts/pt-1/pt-final.pdf',
    } as unknown as Pt);

    await expect(
      service.reject('pt-1', 'user-1', 'Rejeitada depois do PDF'),
    ).rejects.toThrow(BadRequestException);
  });

  it('registra cancelamento da PT na trilha imutável', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
    } as unknown as Pt);

    await expect(
      service.reject('pt-1', 'user-1', 'Condição insegura'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'pt-1',
        status: PtStatus.CANCELADA,
      }),
    );

    const appendCalls = (forensicTrailService.append as jest.Mock).mock
      .calls as Array<[AppendForensicTrailEventInput, { manager?: unknown }]>;
    const firstAppendCall = appendCalls[0];
    if (!firstAppendCall) {
      throw new Error('Expected forensic append call');
    }
    const [appendInput, appendOptions] = firstAppendCall;
    const appendMetadata = appendInput.metadata as Record<string, unknown>;
    expect(appendInput.eventType).toBe(FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED);
    expect(appendInput.module).toBe('pt');
    expect(appendInput.entityId).toBe('pt-1');
    expect(appendInput.companyId).toBe('company-1');
    expect(appendInput.userId).toBe('user-1');
    expect(appendMetadata.previousStatus).toBe(PtStatus.PENDENTE);
    expect(appendMetadata.currentStatus).toBe(PtStatus.CANCELADA);
    expect(appendMetadata.reason).toBe('Condição insegura');
    expect(appendOptions.manager).toBeDefined();
  });

  it('remove a PT via esteira central e aplica a policy de lifecycle', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
    } as unknown as Pt;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    } as unknown as EntityManager;
    ptsRepository.findOne.mockResolvedValue(pt);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState?.(manager);
    });

    await expect(service.remove('pt-1')).resolves.toBeUndefined();

    expect(
      documentGovernanceService.removeFinalDocumentReference,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'pt',
        entityId: 'pt-1',
        trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
        trailMetadata: {
          removalMode: 'soft_delete',
        },
      }),
    );
    expect(softDelete).toHaveBeenCalledWith('pt-1');
  });

  it('bloqueia create generico com status de aprovacao sensivel', async () => {
    await expect(
      service.create({
        numero: 'PT-001',
        titulo: 'PT sensivel',
        data_hora_inicio: '2026-03-14T08:00:00.000Z',
        data_hora_fim: '2026-03-14T18:00:00.000Z',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        status: PtStatus.APROVADA,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia create quando o site nao pertence a empresa atual', async () => {
    getRepositoryMock.mockImplementation((entity: unknown) => {
      if (entity === Site) {
        return {
          exist: jest.fn().mockResolvedValue(false),
        };
      }
      return defaultScopedRepository;
    });

    await expect(
      service.create({
        numero: 'PT-001',
        titulo: 'PT com site invalido',
        data_hora_inicio: '2026-03-14T08:00:00.000Z',
        data_hora_fim: '2026-03-14T18:00:00.000Z',
        site_id: 'site-fora-tenant',
        responsavel_id: 'user-1',
      }),
    ).rejects.toThrow('Site inválido para a empresa/tenant atual.');

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia update generico quando tenta alterar o status da PT', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
      probability: 2,
      severity: 2,
      exposure: 2,
      residual_risk: 'LOW',
      control_evidence: false,
    } as unknown as Pt);

    await expect(
      service.update('pt-1', {
        titulo: 'Tentativa de aprovar no update',
        status: PtStatus.APROVADA,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia update quando a PT ja saiu do estado pendente', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.APROVADA,
      pdf_file_key: null,
      probability: 2,
      severity: 2,
      exposure: 2,
      residual_risk: 'LOW',
      control_evidence: false,
      titulo: 'PT original',
    } as unknown as Pt);

    await expect(
      service.update('pt-1', { titulo: 'PT atualizada' }),
    ).rejects.toThrow(
      'Somente PTs pendentes podem ser editadas pelo formulário.',
    );

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia update quando executantes nao pertencem a empresa atual', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
      site_id: 'site-1',
      responsavel_id: 'user-1',
      apr_id: null,
      auditado_por_id: null,
      executantes: [{ id: 'user-1' }],
      probability: 2,
      severity: 2,
      exposure: 2,
      residual_risk: 'LOW',
      control_evidence: false,
    } as unknown as Pt);
    getRepositoryMock.mockImplementation((entity: unknown) => {
      if (entity === User) {
        return {
          exist: jest.fn().mockResolvedValue(true),
          count: jest.fn().mockResolvedValue(1),
        };
      }
      if (entity === Site || entity === Apr) {
        return {
          exist: jest.fn().mockResolvedValue(true),
        };
      }
      return defaultScopedRepository;
    });

    await expect(
      service.update('pt-1', {
        executantes: ['user-1', 'user-fora-tenant'],
      }),
    ).rejects.toThrow(
      'Executantes contém vínculo(s) inválido(s) para a empresa/tenant atual.',
    );

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('bloqueia create quando usuarios nao pertencem a obra selecionada da PT', async () => {
    const userRepository = {
      exist: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
    };
    getRepositoryMock.mockImplementation((entity: unknown) => {
      if (entity === User) {
        return userRepository;
      }
      if (entity === Site || entity === Apr) {
        return {
          exist: jest.fn().mockResolvedValue(true),
        };
      }
      return defaultScopedRepository;
    });

    await expect(
      service.create({
        numero: 'PT-001',
        titulo: 'PT com executante fora da obra',
        data_hora_inicio: '2026-03-14T08:00:00.000Z',
        data_hora_fim: '2026-03-14T18:00:00.000Z',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        executantes: ['user-1', 'user-outra-obra'],
      }),
    ).rejects.toThrow(
      'Usuários da PT contém vínculo(s) inválido(s) para a obra/setor selecionada.',
    );

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('permite usuario company-scoped ao criar PT em obra selecionada', async () => {
    const userRepository = {
      exist: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(2),
    };
    getRepositoryMock.mockImplementation((entity: unknown) => {
      if (entity === User) {
        return userRepository;
      }
      if (entity === Site || entity === Apr) {
        return {
          exist: jest.fn().mockResolvedValue(true),
        };
      }
      return defaultScopedRepository;
    });

    await expect(
      service.create({
        numero: 'PT-002',
        titulo: 'PT com executante company-scoped',
        data_hora_inicio: '2026-03-14T08:00:00.000Z',
        data_hora_fim: '2026-03-14T18:00:00.000Z',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        executantes: ['user-1', 'user-company-scoped'],
      }),
    ).resolves.toBeTruthy();

    expect(ptsSaveMock).toHaveBeenCalled();
  });

  it('findPaginated: aplica filtro deleted_at IS NULL para excluir PTs removidas', async () => {
    const andWhereMock = jest.fn().mockReturnThis();
    const getManyAndCountMock = jest.fn().mockResolvedValue([[], 0]);
    const qbChain = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: andWhereMock,
      getManyAndCount: getManyAndCountMock,
    };
    (
      ptsRepository as unknown as { createQueryBuilder: jest.Mock }
    ).createQueryBuilder = jest.fn().mockReturnValue(qbChain);

    await service.findPaginated({ page: 1, limit: 10 });

    const whereCall = qbChain.where.mock.calls[0] as [string];
    expect(whereCall[0]).toContain('deleted_at IS NULL');
  });

  it('exportExcel: aplica filtro deleted_at IS NULL para excluir PTs removidas', async () => {
    const getMany = jest.fn().mockResolvedValue([]);
    const qbChain = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany,
    };
    (
      ptsRepository as unknown as { createQueryBuilder: jest.Mock }
    ).createQueryBuilder = jest.fn().mockReturnValue(qbChain);

    await service.exportExcel();

    const whereCall = qbChain.where.mock.calls[0] as [string];
    expect(whereCall[0]).toContain('deleted_at IS NULL');
  });

  it('getPdfAccess: retorna disponibilidade explicita quando a PT nao possui PDF armazenado', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      pdf_file_key: null,
    } as unknown as Pt);

    await expect(service.getPdfAccess('pt-1')).resolves.toEqual({
      entityId: 'pt-1',
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'A PT ainda não possui PDF final emitido.',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
    });
  });

  it('permite finalizar PT aprovada ou expirada pelo fluxo formal', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.EXPIRADA,
      pdf_file_key: null,
    } as unknown as Pt);

    await expect(service.finalize('pt-1', 'user-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'pt-1',
        status: PtStatus.ENCERRADA,
      }),
    );
  });

  it('getAnalyticsOverview: retorna contagem consolidada por status', async () => {
    (ptsRepository.count as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    await expect(service.getAnalyticsOverview()).resolves.toEqual({
      totalPts: 10,
      aprovadas: 3,
      pendentes: 4,
      canceladas: 1,
      encerradas: 1,
      expiradas: 1,
    });
  });

  it('bloqueia aprovacao quando transicao de status e invalida (Cancelada -> Aprovada)', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.CANCELADA,
      pdf_file_key: null,
      executantes: [],
    } as unknown as Pt);

    await expect(service.approve('pt-1', 'approver-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia aprovacao quando o risco residual e CRITICAL sem evidencia de controle', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
      residual_risk: 'CRITICAL',
      control_evidence: false,
      responsavel_id: 'resp-1',
      executantes: [],
    } as unknown as Pt);
    (companiesRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'company-1',
      pt_approval_rules: {
        blockCriticalRiskWithoutEvidence: true,
        blockWorkerWithoutValidMedicalExam: false,
        blockWorkerWithExpiredBlockingTraining: false,
        requireAtLeastOneExecutante: false,
      },
    });
    (
      workerOperationalStatusService.getByUserIds as jest.Mock
    ).mockResolvedValue([]);

    await expect(service.approve('pt-1', 'approver-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia aprovacao quando trabalhador possui treinamento bloqueante vencido', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
      residual_risk: 'LOW',
      control_evidence: true,
      responsavel_id: 'resp-1',
      executantes: [],
    } as unknown as Pt);
    (companiesRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'company-1',
      pt_approval_rules: {
        blockCriticalRiskWithoutEvidence: true,
        blockWorkerWithoutValidMedicalExam: false,
        blockWorkerWithExpiredBlockingTraining: true,
        requireAtLeastOneExecutante: false,
      },
    });
    (
      workerOperationalStatusService.getByUserIds as jest.Mock
    ).mockResolvedValue([
      {
        user: { nome: 'Responsável' },
        medicalExam: { status: 'VALIDO' },
        trainings: { expiredBlocking: [{ nome: 'NR-35 Trabalho em Altura' }] },
      },
    ]);

    let approvalError: unknown;

    try {
      await service.approve('pt-1', 'approver-1');
    } catch (error) {
      approvalError = error;
    }

    expect(approvalError).toBeInstanceOf(BadRequestException);

    if (!(approvalError instanceof BadRequestException)) {
      return;
    }

    const response = approvalError.getResponse() as {
      code?: string;
      reasons?: unknown;
    };

    if (
      response.code !== 'PT_APPROVAL_BLOCKED' ||
      !Array.isArray(response.reasons)
    ) {
      throw new Error('Expected PT approval block response payload');
    }

    expect(response.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NR-35 Trabalho em Altura'),
      ]),
    );
  });

  it('bloqueia aprovacao quando ainda existem executantes sem assinatura unica valida', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
      residual_risk: 'LOW',
      control_evidence: true,
      responsavel_id: 'resp-1',
      executantes: [
        { id: 'user-1', nome: 'Executor 1' },
        { id: 'user-2', nome: 'Executor 2' },
      ],
    } as unknown as Pt);
    (companiesRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'company-1',
      pt_approval_rules: {
        blockCriticalRiskWithoutEvidence: true,
        blockWorkerWithoutValidMedicalExam: true,
        blockWorkerWithExpiredBlockingTraining: true,
        requireAtLeastOneExecutante: true,
      },
    });
    (
      workerOperationalStatusService.getByUserIds as jest.Mock
    ).mockResolvedValue([
      {
        user: { nome: 'Responsável' },
        medicalExam: { status: 'VALIDO' },
        trainings: { expiredBlocking: [] },
      },
      {
        user: { nome: 'Executor 1' },
        medicalExam: { status: 'VALIDO' },
        trainings: { expiredBlocking: [] },
      },
      {
        user: { nome: 'Executor 2' },
        medicalExam: { status: 'VALIDO' },
        trainings: { expiredBlocking: [] },
      },
    ]);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      { user_id: 'user-1' },
      { user_id: 'user-1' },
    ]);

    await expect(service.approve('pt-1', 'approver-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
