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
import { DocumentBundleService } from '../common/services/document-bundle.service';
import { S3Service } from '../common/storage/s3.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

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
  let documentBundleService: Partial<DocumentBundleService>;
  let s3Service: Partial<S3Service>;
  let documentGovernanceService: Partial<DocumentGovernanceService>;

  beforeEach(() => {
    ptsSaveMock = jest.fn((input: Pt) => Promise.resolve(input));
    auditLogsFindMock = jest.fn();
    ptsRepository = {
      findOne: jest.fn(),
      save: ptsSaveMock,
    } as unknown as jest.Mocked<Repository<Pt>>;
    companiesRepository = {} as jest.Mocked<Repository<Company>>;
    auditLogsRepository = {
      find: auditLogsFindMock,
    } as unknown as jest.Mocked<Repository<AuditLog>>;
    tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    };
    riskCalculationService = {
      calculateScore: jest.fn(),
      classifyByScore: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };
    workerOperationalStatusService = {};
    documentBundleService = {};
    s3Service = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/pts/pt-1/pt-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new PtsService(
      ptsRepository as unknown as Repository<Pt>,
      companiesRepository as unknown as Repository<Company>,
      auditLogsRepository as unknown as Repository<AuditLog>,
      tenantService as TenantService,
      riskCalculationService as RiskCalculationService,
      auditService as AuditService,
      workerOperationalStatusService as WorkerOperationalStatusService,
      documentBundleService as DocumentBundleService,
      s3Service as S3Service,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  it('registra a pré-liberação no audit log com ação PRE_APPROVAL', async () => {
    const pt = {
      id: 'pt-1',
      numero: 'PT-001',
      titulo: 'Trabalho em altura',
      status: 'Pendente',
      company_id: 'company-1',
    } as Pt;

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
    } as Pt;

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
      } as AuditLog,
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
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Pt;
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
      fileKey: 'documents/company-1/pts/pt-1/pt-final.pdf',
      folderPath: 'pts/company-1',
      originalName: 'pt-final.pdf',
    });

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'pt',
        entityId: 'pt-1',
        fileBuffer: file.buffer,
        createdBy: 'user-1',
      }),
    );
    expect(update).toHaveBeenCalledWith('pt-1', {
      pdf_file_key: 'documents/company-1/pts/pt-1/pt-final.pdf',
      pdf_folder_path: 'pts/company-1',
      pdf_original_name: 'pt-final.pdf',
    });
  });

  it('remove o arquivo do storage quando a governanca falha depois do upload da PT', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Pt;
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

    expect(s3Service.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/pts/pt-1/pt-final.pdf',
    );
  });

  it('nao tenta limpar storage quando o fallback local da PT foi usado', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
      titulo: 'PT Trabalho em altura',
      numero: 'PT-001',
      status: PtStatus.APROVADA,
      data_hora_inicio: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Pt;
    ptsRepository.findOne.mockResolvedValue(pt);
    (s3Service.uploadFile as jest.Mock).mockRejectedValue(
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
      'governance failed',
    );

    expect(s3Service.deleteFile).not.toHaveBeenCalled();
  });

  it('bloqueia o anexo final quando a PT ainda nao esta aprovada', async () => {
    ptsRepository.findOne.mockResolvedValue({
      id: 'pt-1',
      company_id: 'company-1',
      status: PtStatus.PENDENTE,
      pdf_file_key: null,
    } as Pt);

    const file = {
      originalname: 'pt-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-pt'),
    } as Express.Multer.File;

    await expect(service.attachPdf('pt-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );

    expect(s3Service.uploadFile).not.toHaveBeenCalled();
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
    } as Pt);

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
    } as Pt);

    await expect(
      service.reject('pt-1', 'user-1', 'Rejeitada depois do PDF'),
    ).rejects.toThrow(BadRequestException);
  });

  it('remove a PT via esteira central e aplica a policy de lifecycle', async () => {
    const pt = {
      id: 'pt-1',
      company_id: 'company-1',
    } as Pt;
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
    } as Pt);

    await expect(
      service.update('pt-1', {
        titulo: 'Tentativa de aprovar no update',
        status: PtStatus.APROVADA,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(ptsSaveMock).not.toHaveBeenCalled();
  });

  it('permite update generico mantendo o mesmo status ja existente', async () => {
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
    } as Pt);

    await expect(
      service.update('pt-1', {
        titulo: 'PT atualizada sem mudar o status',
        status: PtStatus.APROVADA,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        titulo: 'PT atualizada sem mudar o status',
        status: PtStatus.APROVADA,
      }),
    );

    expect(ptsSaveMock).toHaveBeenCalledTimes(1);
  });
});
