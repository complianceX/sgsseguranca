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
import { CompaniesService } from '../companies/companies.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { DistributedLockService } from '../common/redis/distributed-lock.service';

// Mock do Resend
const mockResendSend = jest.fn();
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: mockResendSend,
      },
    })),
  };
});

describe('MailService', () => {
  const originalApiCronsDisabled = process.env.API_CRONS_DISABLED;
  let service: MailService;
  let documentStorageService: DocumentStorageService;
  let ptsService: PtsService;
  let mailLogRepository: any;

  const mockMailLogRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn((log) => Promise.resolve({ id: 'log-123', ...log })),
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

  // Mock dos serviços de domínio
  const mockDomainService = {
    findOne: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn().mockResolvedValue([]),
  };

  const mockTenantService = {
    run: jest.fn((id, cb) => cb()),
  };
  const mockIntegrationResilienceService = {
    execute: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  const mockDistributedLockService = {
    tryAcquire: jest.fn(async () => ({
      key: 'lock:mail:scheduled-alerts',
      token: 'token-1',
    })),
    release: jest.fn(async () => true),
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
    mailLogRepository = module.get(getRepositoryToken(MailLog));
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

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Assunto Teste',
        }),
      );
      expect(mailLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message_id: 'msg-123',
        }),
      );
      expect(mailLogRepository.save).toHaveBeenCalled();
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

      expect(mailLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error_message: expect.stringContaining(errorMsg),
        }),
      );
      expect(mailLogRepository.save).toHaveBeenCalled();
    });

    it('deve capturar exceções inesperadas durante o envio', async () => {
      mockResendSend.mockRejectedValue(new Error('Erro de rede'));

      await expect(
        service.sendMailSimple('user@example.com', 'Assunto', 'Texto'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mailLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error_message: 'Erro de rede',
        }),
      );
    });
  });

  describe('sendStoredDocument', () => {
    it('deve enviar um documento PT corretamente', async () => {
      const mockPt = {
        id: 'pt-1',
        numero: '123',
        pdf_file_key: 'pts/arquivo.pdf',
      };
      jest.spyOn(ptsService, 'findOne').mockResolvedValue(mockPt as any);
      jest
        .spyOn(documentStorageService, 'downloadFileBuffer')
        .mockResolvedValue(Buffer.from('pdf-content'));
      mockResendSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

      await service.sendStoredDocument(
        'pt-1',
        'PT',
        'destinatario@example.com',
      );

      expect(ptsService.findOne).toHaveBeenCalledWith('pt-1');
      expect(documentStorageService.downloadFileBuffer).toHaveBeenCalledWith(
        'pts/arquivo.pdf',
      );
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'destinatario@example.com',
          subject: expect.stringContaining('Permissão de Trabalho #123'),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: expect.stringContaining('.pdf'),
            }),
          ]),
        }),
      );
      expect(mailLogRepository.save).toHaveBeenCalled();
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
      const mockPtSemArquivo = {
        id: 'pt-1',
        numero: '123',
        pdf_file_key: null,
      };
      jest
        .spyOn(ptsService, 'findOne')
        .mockResolvedValue(mockPtSemArquivo as any);

      await expect(
        service.sendStoredDocument('pt-1', 'PT', 'email@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro para tipos de documento não suportados', async () => {
      await expect(
        service.sendStoredDocument('id', 'TIPO_INVALIDO', 'email@test.com'),
      ).rejects.toThrow('Tipo de documento não suportado');
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
        service as unknown as {
          runScheduledAlerts: () => Promise<void>;
        }
      ).runScheduledAlerts();

      expect(mockDomainService.findAllActive).not.toHaveBeenCalled();
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('nao executa alertas agendados quando outro processo detem o lock', async () => {
      process.env.API_CRONS_DISABLED = 'false';
      mockDistributedLockService.tryAcquire.mockResolvedValueOnce(null);

      await (
        service as unknown as {
          runScheduledAlerts: () => Promise<void>;
        }
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
