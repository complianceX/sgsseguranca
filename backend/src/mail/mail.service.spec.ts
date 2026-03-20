import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MailLog } from './entities/mail-log.entity';
import { EpisService } from '../epis/epis.service';
import { TrainingsService } from '../trainings/trainings.service';
import { PtsService } from '../pts/pts.service';
import { AprsService } from '../aprs/aprs.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { DdsService } from '../dds/dds.service';
import { InspectionsService } from '../inspections/inspections.service';
import { AuditsService } from '../audits/audits.service';
import { RdosService } from '../rdos/rdos.service';
import { CompaniesService } from '../companies/companies.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { DistributedLockService } from '../common/redis/distributed-lock.service';
import { Cat } from '../cats/entities/cat.entity';

// Mock do Resend
const mockResendSend = jest.fn<(payload: unknown) => Promise<unknown>>();
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: mockResendSend,
      },
    })),
  };
});

type MailLogRepositoryMock = {
  create: jest.Mock<Partial<MailLog>, [Partial<MailLog>]>;
  save: jest.Mock<Promise<MailLog & { id: string }>, [Partial<MailLog>]>;
  createQueryBuilder: jest.Mock;
};

type PtDocument = Awaited<ReturnType<PtsService['findOne']>>;
type NonConformityDocument = Awaited<
  ReturnType<NonConformitiesService['findOne']>
>;
type NonConformityPdfAccess = Awaited<
  ReturnType<NonConformitiesService['getPdfAccess']>
>;
type InspectionDocument = Awaited<ReturnType<InspectionsService['findOne']>>;
type InspectionPdfAccess = Awaited<
  ReturnType<InspectionsService['getPdfAccess']>
>;
type AuditDocument = Awaited<ReturnType<AuditsService['findOne']>>;
type AuditPdfAccess = Awaited<ReturnType<AuditsService['getPdfAccess']>>;
type RdoDocument = Awaited<ReturnType<RdosService['findOne']>>;
type RdoPdfAccess = Awaited<ReturnType<RdosService['getPdfAccess']>>;
type MailServiceWithScheduledAlerts = {
  runScheduledAlerts(): Promise<void>;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);
const getFirstMockArgument = (mockFn: jest.Mock): unknown => {
  const calls = mockFn.mock.calls as unknown[][];
  const firstCall = calls[0];
  return isUnknownArray(firstCall) ? firstCall[0] : undefined;
};

describe('MailService', () => {
  const originalApiCronsDisabled = process.env.API_CRONS_DISABLED;
  let service: MailService;
  let documentStorageService: DocumentStorageService;
  let ptsService: PtsService;
  let nonConformitiesService: NonConformitiesService;
  let inspectionsService: InspectionsService;
  let auditsService: AuditsService;
  let rdosService: RdosService;
  let mailLogRepository: MailLogRepositoryMock;

  const mockMailLogRepository: MailLogRepositoryMock = {
    create: jest.fn((dto: Partial<MailLog>) => dto),
    save: jest.fn((log: Partial<MailLog>) =>
      Promise.resolve({ id: 'log-123', ...(log as MailLog) }),
    ),
    createQueryBuilder: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'RESEND_API_KEY') return 're_123456';
      if (key === 'MAIL_FROM_EMAIL') return 'test@example.com';
      return null;
    }),
  };

  const mockDocumentStorageService = {
    getPresignedDownloadUrl: jest.fn(),
    downloadFileBuffer: jest.fn(),
  };
  const mockCatsRepository = {
    findOne: jest.fn(),
  };

  // Mock dos serviços de domínio
  const mockDomainService = {
    findOne: jest.fn(),
    getPdfAccess: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn().mockResolvedValue([]),
  };

  const mockTenantService = {
    run: jest.fn((_id: string, cb: () => unknown) => cb()),
    getTenantId: jest.fn((): string => 'company-1'),
  };
  const mockIntegrationResilienceService = {
    execute: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  };
  const mockDistributedLockService = {
    tryAcquire: jest.fn(() =>
      Promise.resolve({
        key: 'lock:mail:scheduled-alerts',
        token: 'token-1',
      }),
    ),
    release: jest.fn(() => Promise.resolve(true)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(MailLog),
          useValue: mockMailLogRepository,
        },
        {
          provide: getRepositoryToken(Cat),
          useValue: mockCatsRepository,
        },
        {
          provide: DocumentStorageService,
          useValue: mockDocumentStorageService,
        },
        { provide: EpisService, useValue: mockDomainService },
        { provide: TrainingsService, useValue: mockDomainService },
        { provide: PtsService, useValue: mockDomainService },
        { provide: AprsService, useValue: mockDomainService },
        { provide: ChecklistsService, useValue: mockDomainService },
        { provide: NonConformitiesService, useValue: mockDomainService },
        { provide: DdsService, useValue: mockDomainService },
        { provide: InspectionsService, useValue: mockDomainService },
        { provide: AuditsService, useValue: mockDomainService },
        { provide: RdosService, useValue: mockDomainService },
        { provide: CompaniesService, useValue: mockDomainService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: ReportsService, useValue: mockDomainService },
        {
          provide: IntegrationResilienceService,
          useValue: mockIntegrationResilienceService,
        },
        {
          provide: DistributedLockService,
          useValue: mockDistributedLockService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    documentStorageService = module.get<DocumentStorageService>(
      DocumentStorageService,
    );
    ptsService = module.get<PtsService>(PtsService);
    nonConformitiesService = module.get<NonConformitiesService>(
      NonConformitiesService,
    );
    inspectionsService = module.get<InspectionsService>(InspectionsService);
    auditsService = module.get<AuditsService>(AuditsService);
    rdosService = module.get<RdosService>(RdosService);
    mailLogRepository = module.get<MailLogRepositoryMock>(
      getRepositoryToken(MailLog),
    );
  });

  afterEach(() => {
    process.env.API_CRONS_DISABLED = originalApiCronsDisabled;
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('sendMailSimple', () => {
    it('deve enviar um email com sucesso e salvar o log', async () => {
      mockResendSend.mockResolvedValue({
        data: { id: 'msg-123' },
        error: null,
      });

      const result = await service.sendMailSimple(
        'user@example.com',
        'Assunto Teste',
        'Conteúdo do email',
        { companyId: 'comp-1', userId: 'user-1' },
      );

      const sendPayload = getFirstMockArgument(mockResendSend);
      if (!isRecord(sendPayload)) {
        throw new Error('Payload do Resend não foi registrado corretamente.');
      }

      const createdLog = mailLogRepository.create.mock.calls[0]?.[0];
      if (!isRecord(createdLog)) {
        throw new Error('Log de e-mail não foi criado corretamente.');
      }

      expect(sendPayload.to).toBe('user@example.com');
      expect(sendPayload.subject).toBe('Assunto Teste');
      expect(createdLog.status).toBe('success');
      expect(createdLog.message_id).toBe('msg-123');
      expect(mailLogRepository.save).toHaveBeenCalled();

      if (!isRecord(result.info) || !isRecord(result.info.data)) {
        throw new Error('Resposta do envio não retornou o payload esperado.');
      }

      expect(result.info.data.id).toBe('msg-123');
    });

    it('deve lançar ServiceUnavailableException e salvar log de erro quando o Resend falhar', async () => {
      const errorMsg = 'API Key inválida';
      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: errorMsg },
      });

      await expect(
        service.sendMailSimple('user@example.com', 'Assunto', 'Texto'),
      ).rejects.toThrow(ServiceUnavailableException);

      const createdLog = mailLogRepository.create.mock.calls[0]?.[0];
      if (!isRecord(createdLog)) {
        throw new Error('Log de erro do Resend não foi criado.');
      }

      expect(createdLog.status).toBe('error');
      expect(createdLog.error_message).toEqual(
        expect.stringContaining(errorMsg),
      );
      expect(mailLogRepository.save).toHaveBeenCalled();
    });

    it('deve capturar exceções inesperadas durante o envio', async () => {
      mockResendSend.mockRejectedValue(new Error('Erro de rede'));

      await expect(
        service.sendMailSimple('user@example.com', 'Assunto', 'Texto'),
      ).rejects.toThrow(ServiceUnavailableException);

      const createdLog = mailLogRepository.create.mock.calls[0]?.[0];
      if (!isRecord(createdLog)) {
        throw new Error('Log de exceção de envio não foi criado.');
      }

      expect(createdLog.status).toBe('error');
      expect(createdLog.error_message).toBe('Erro de rede');
    });
  });

  describe('sendStoredDocument', () => {
    it('deve enviar um documento PT corretamente', async () => {
      const mockPt: PtDocument = {
        id: 'pt-1',
        numero: '123',
        pdf_file_key: 'pts/arquivo.pdf',
      } as PtDocument;
      const findPtSpy = jest
        .spyOn(ptsService, 'findOne')
        .mockResolvedValue(mockPt);
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('pdf-content'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

      const result = await service.sendStoredDocument(
        'pt-1',
        'PT',
        'destinatario@example.com',
      );

      expect(findPtSpy).toHaveBeenCalledWith('pt-1');
      expect(downloadBufferSpy).toHaveBeenCalledWith('pts/arquivo.pdf');
      const sendPayload = getFirstMockArgument(mockResendSend);
      if (!isRecord(sendPayload) || !isUnknownArray(sendPayload.attachments)) {
        throw new Error('Payload do Resend para PT não contém anexos válidos.');
      }

      expect(sendPayload.to).toBe('destinatario@example.com');
      expect(String(sendPayload.subject)).toContain(
        'Permissão de Trabalho #123',
      );
      const firstAttachment = sendPayload.attachments[0];
      if (!isRecord(firstAttachment)) {
        throw new Error('Anexo do PT não foi serializado corretamente.');
      }
      expect(String(firstAttachment.filename)).toContain('.pdf');
      expect(mailLogRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        success: true,
        artifactType: 'governed_final_pdf',
        isOfficial: true,
        fallbackUsed: false,
        documentId: 'pt-1',
        documentType: 'PT',
      });
    });

    it('deve lançar NotFoundException se o documento não for encontrado no serviço de origem', async () => {
      jest
        .spyOn(ptsService, 'findOne')
        .mockRejectedValue(new NotFoundException());

      await expect(
        service.sendStoredDocument('pt-invalida', 'PT', 'email@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se o documento não tiver chave de arquivo (pdf_file_key)', async () => {
      const mockPtSemArquivo: PtDocument = {
        id: 'pt-1',
        numero: '123',
        pdf_file_key: null,
      } as PtDocument;
      jest.spyOn(ptsService, 'findOne').mockResolvedValue(mockPtSemArquivo);

      await expect(
        service.sendStoredDocument('pt-1', 'PT', 'email@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro para tipos de documento não suportados', async () => {
      await expect(
        service.sendStoredDocument('id', 'TIPO_INVALIDO', 'email@test.com'),
      ).rejects.toThrow('Tipo de documento não suportado');
    });

    it('deve enviar um relatório de inspeção governado corretamente', async () => {
      const inspection: InspectionDocument = {
        id: 'inspection-1',
        tipo_inspecao: 'Rotina',
        setor_area: 'Subestação',
      } as InspectionDocument;
      const inspectionPdfAccess: InspectionPdfAccess = {
        entityId: 'inspection-1',
        hasFinalPdf: true,
        availability: 'ready',
        fileKey: 'inspections/final.pdf',
        folderPath: 'inspections/company-1/2026/week-11',
        originalName: 'inspection-final.pdf',
        url: 'https://signed.example.com/inspection-final.pdf',
        message: null,
      };
      const findInspectionSpy = jest
        .spyOn(inspectionsService, 'findOne')
        .mockResolvedValue(inspection);
      const inspectionPdfAccessSpy = jest
        .spyOn(inspectionsService, 'getPdfAccess')
        .mockResolvedValue(inspectionPdfAccess);
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('inspection-pdf'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

      await service.sendStoredDocument(
        'inspection-1',
        'INSPECTION',
        'destinatario@example.com',
        'company-1',
      );

      expect(findInspectionSpy).toHaveBeenCalledWith(
        'inspection-1',
        'company-1',
      );
      expect(inspectionPdfAccessSpy).toHaveBeenCalledWith(
        'inspection-1',
        'company-1',
      );
      expect(downloadBufferSpy).toHaveBeenCalledWith('inspections/final.pdf');
    });

    it('deve enviar uma auditoria governada corretamente', async () => {
      const audit: AuditDocument = {
        id: 'audit-1',
        titulo: 'Auditoria HSE',
      } as AuditDocument;
      const auditPdfAccess: AuditPdfAccess = {
        entityId: 'audit-1',
        hasFinalPdf: true,
        availability: 'ready',
        message: null,
        fileKey: 'audits/final.pdf',
        folderPath: 'audits/company-1',
        originalName: 'audit-final.pdf',
        url: 'https://signed.example.com/audit-final.pdf',
      };
      const findAuditSpy = jest
        .spyOn(auditsService, 'findOne')
        .mockResolvedValue(audit);
      const auditPdfAccessSpy = jest
        .spyOn(auditsService, 'getPdfAccess')
        .mockResolvedValue(auditPdfAccess);
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('audit-pdf'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-3' }, error: null });

      await service.sendStoredDocument(
        'audit-1',
        'AUDIT',
        'destinatario@example.com',
        'company-1',
      );

      expect(findAuditSpy).toHaveBeenCalledWith('audit-1', 'company-1');
      expect(auditPdfAccessSpy).toHaveBeenCalledWith('audit-1', 'company-1');
      expect(downloadBufferSpy).toHaveBeenCalledWith('audits/final.pdf');
    });

    it('deve enviar uma não conformidade governada corretamente', async () => {
      const nonConformity: NonConformityDocument = {
        id: 'nc-1',
        codigo_nc: 'NC-001',
      } as NonConformityDocument;
      const pdfAccess: NonConformityPdfAccess = {
        entityId: 'nc-1',
        hasFinalPdf: true,
        availability: 'ready',
        fileKey: 'nonconformities/final.pdf',
        folderPath: 'nonconformities/company-1/week-11',
        originalName: 'nc-001.pdf',
        url: 'https://signed.example.com/nc-001.pdf',
        message: null,
      };
      const findNcSpy = jest
        .spyOn(nonConformitiesService, 'findOne')
        .mockResolvedValue(nonConformity);
      const ncPdfAccessSpy = jest
        .spyOn(nonConformitiesService, 'getPdfAccess')
        .mockResolvedValue(pdfAccess);
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('nc-pdf'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-4' }, error: null });

      await service.sendStoredDocument(
        'nc-1',
        'NONCONFORMITY',
        'destinatario@example.com',
      );

      expect(findNcSpy).toHaveBeenCalledWith('nc-1');
      expect(ncPdfAccessSpy).toHaveBeenCalledWith('nc-1');
      expect(downloadBufferSpy).toHaveBeenCalledWith(
        'nonconformities/final.pdf',
      );
    });

    it('deve enviar uma CAT com PDF final governado', async () => {
      mockCatsRepository.findOne.mockResolvedValue({
        id: 'cat-1',
        numero: 'CAT-20260319-0001',
        pdf_file_key: 'documents/company-1/cats/cat-1/cat-final.pdf',
      });
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('cat-pdf'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-5' }, error: null });

      await service.sendStoredDocument(
        'cat-1',
        'CAT',
        'destinatario@example.com',
        'company-1',
      );

      expect(mockCatsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'cat-1', company_id: 'company-1' },
        select: ['id', 'numero', 'pdf_file_key'],
      });
      expect(downloadBufferSpy).toHaveBeenCalledWith(
        'documents/company-1/cats/cat-1/cat-final.pdf',
      );
    });

    it('deve enviar um RDO com PDF final governado', async () => {
      const rdo: RdoDocument = {
        id: 'rdo-1',
        numero: 'RDO-202603-0001',
      } as RdoDocument;
      const rdoPdfAccess: RdoPdfAccess = {
        entityId: 'rdo-1',
        hasFinalPdf: true,
        availability: 'registered_without_signed_url',
        message:
          'O PDF final do RDO foi emitido, mas a URL segura não está disponível agora.',
        fileKey: 'rdos/final.pdf',
        folderPath: 'rdos/company-1/week-12',
        originalName: 'rdo-final.pdf',
        url: null,
      };
      const findRdoSpy = jest
        .spyOn(rdosService, 'findOne')
        .mockResolvedValue(rdo);
      const rdoPdfAccessSpy = jest
        .spyOn(rdosService, 'getPdfAccess')
        .mockResolvedValue(rdoPdfAccess);
      const downloadBufferSpy = jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('rdo-pdf'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-6' }, error: null });

      const result = await service.sendStoredDocument(
        'rdo-1',
        'RDO',
        'destinatario@example.com',
        'company-1',
      );

      expect(findRdoSpy).toHaveBeenCalledWith('rdo-1');
      expect(rdoPdfAccessSpy).toHaveBeenCalledWith('rdo-1');
      expect(downloadBufferSpy).toHaveBeenCalledWith('rdos/final.pdf');
      expect(result).toMatchObject({
        success: true,
        artifactType: 'governed_final_pdf',
        isOfficial: true,
        fallbackUsed: false,
        documentId: 'rdo-1',
        documentType: 'RDO',
      });
    });
  });

  describe('extractErrorMessage', () => {
    // Como o método é privado, testamos indiretamente ou usamos cast para any se necessário,
    // mas aqui vamos confiar nos testes de integração do sendMailSimple que usam ele.
    it('deve extrair mensagem de erro corretamente (teste via sendMailSimple)', async () => {
      mockResendSend.mockRejectedValue('Erro string pura');

      await expect(
        service.sendMailSimple('to', 'sub', 'txt'),
      ).rejects.toThrow();

      expect(mailLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: 'Erro string pura',
        }),
      );
    });
  });

  describe('runScheduledAlerts', () => {
    it('nao executa alertas agendados quando API_CRONS_DISABLED=true', async () => {
      process.env.API_CRONS_DISABLED = 'true';

      await (
        service as unknown as MailServiceWithScheduledAlerts
      ).runScheduledAlerts();

      expect(mockDomainService.findAllActive).not.toHaveBeenCalled();
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('nao executa alertas agendados quando outro processo detem o lock', async () => {
      process.env.API_CRONS_DISABLED = 'false';
      mockDistributedLockService.tryAcquire.mockResolvedValueOnce(null);

      await (
        service as unknown as MailServiceWithScheduledAlerts
      ).runScheduledAlerts();

      expect(mockDistributedLockService.tryAcquire).toHaveBeenCalledWith(
        'mail:scheduled-alerts',
        600000,
      );
      expect(mockDomainService.findAllActive).not.toHaveBeenCalled();
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });
});
