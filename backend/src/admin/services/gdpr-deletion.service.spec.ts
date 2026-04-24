import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GDPRDeletionService } from '../services/gdpr-deletion.service';
import { GdprDeletionRequest } from '../entities/gdpr-deletion-request.entity';
import { GdprRetentionCleanupRun } from '../entities/gdpr-retention-cleanup-run.entity';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440001';

describe('GDPRDeletionService', () => {
  let service: GDPRDeletionService;
  let mockDataSource: { query: jest.Mock };
  let mockRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let mockRetentionRunRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    mockDataSource = { query: jest.fn() };
    mockRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    mockRetentionRunRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (entity) => ({
        id: 'retention-run-1',
        ...entity,
      })),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GDPRDeletionService,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: getRepositoryToken(GdprDeletionRequest),
          useValue: mockRepo,
        },
        {
          provide: getRepositoryToken(GdprRetentionCleanupRun),
          useValue: mockRetentionRunRepo,
        },
      ],
    }).compile();

    service = module.get<GDPRDeletionService>(GDPRDeletionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('deleteUserData', () => {
    it('anonymiza dados e retorna status completed', async () => {
      mockDataSource.query.mockResolvedValue([
        { table_name: 'activities', deleted_count: '5' },
        { table_name: 'audit_logs', deleted_count: '10' },
        { table_name: 'user_sessions', deleted_count: '2' },
      ]);

      const result = await service.deleteUserData(VALID_UUID);

      expect(result.status).toBe('completed');
      expect(result.user_id).toBe(VALID_UUID);
      expect(result.tables_processed).toHaveLength(3);
      expect(result.tables_processed[0].rows_deleted).toBe(5);
    });

    it('retorna UUID válido como request ID', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.deleteUserData(VALID_UUID);

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('persiste o registro duas vezes (criação + atualização final)', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.deleteUserData(VALID_UUID);

      // save chamado no início (in_progress) e no finally (completed/failed)
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });

    it('rejeita user ID com formato inválido antes de criar o registro', async () => {
      await expect(service.deleteUserData('not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('marca status como failed e persiste em caso de erro no banco', async () => {
      mockDataSource.query.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await service.deleteUserData(VALID_UUID);

      expect(result.status).toBe('failed');
      expect(result.error_message).toContain('Database connection failed');
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteExpiredData', () => {
    it('executa cleanup TTL com sucesso', async () => {
      mockDataSource.query.mockResolvedValue([
        { table_name: 'mail_logs', deleted_count: '100' },
        { table_name: 'user_sessions', deleted_count: '25' },
        { table_name: 'forensic_trail_events', deleted_count: '5' },
        { table_name: 'activities', deleted_count: '10' },
        { table_name: 'audit_logs', deleted_count: '8' },
      ]);

      const result = await service.deleteExpiredData();

      expect(result.status).toBe('success');
      expect(result.run_id).toBe('retention-run-1');
      expect(result.total_rows_deleted).toBe(148);
      expect(result.tables_cleaned).toHaveLength(5);
      expect(mockRetentionRunRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          triggered_by: 'manual',
          trigger_source: 'admin:gdpr-cleanup-expired',
          total_rows_deleted: 148,
        }),
      );
    });

    it('retorna contagem por tabela', async () => {
      mockDataSource.query.mockResolvedValue([
        { table_name: 'mail_logs', deleted_count: '100' },
      ]);

      const result = await service.deleteExpiredData();

      expect(result.tables_cleaned[0].table).toBe('mail_logs');
      expect(result.tables_cleaned[0].rows_deleted).toBe(100);
    });

    it('inclui duração da execução', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const before = Date.now();
      const result = await service.deleteExpiredData();
      const after = Date.now();

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.duration_ms).toBeLessThanOrEqual(after - before + 100);
    });

    it('retorna status error em caso de falha', async () => {
      mockDataSource.query.mockRejectedValue(new Error('TTL function not found'));

      const result = await service.deleteExpiredData();

      expect(result.status).toBe('error');
      expect(result.run_id).toBe('retention-run-1');
      expect(mockRetentionRunRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error_message: 'TTL function not found',
        }),
      );
    });

    it('marca execucao agendada quando chamada pelo worker', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.deleteExpiredData({
        triggeredBy: 'scheduled',
        triggerSource: 'worker:gdpr-retention-cleanup',
      });

      expect(mockRetentionRunRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          triggered_by: 'scheduled',
          trigger_source: 'worker:gdpr-retention-cleanup',
        }),
      );
    });
  });

  describe('deleteCompanyData', () => {
    it('soft-deleta dados da empresa em todas as tabelas', async () => {
      mockDataSource.query.mockResolvedValue([1, 2, 3]);

      const result = await service.deleteCompanyData(VALID_UUID);

      expect(result.status).toBe('success');
      expect(result.company_id).toBe(VALID_UUID);
      expect(result.total_rows_deleted).toBeGreaterThan(0);
    });

    it('rejeita company ID inválido', async () => {
      await expect(service.deleteCompanyData('invalid-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('inclui aviso sobre soft-delete e retenção', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.deleteCompanyData(VALID_UUID);

      expect(result.warning).toContain('soft-deleted');
      expect(result.warning).toContain('retention policy');
    });
  });

  describe('getRetentionCleanupRuns', () => {
    it('lista runs de limpeza de retencao com limite saneado', async () => {
      mockRetentionRunRepo.find.mockResolvedValue([
        { id: 'run-1', status: 'success' },
      ]);

      const result = await service.getRetentionCleanupRuns(500);

      expect(result).toHaveLength(1);
      expect(mockRetentionRunRepo.find).toHaveBeenCalledWith({
        order: { created_at: 'DESC' },
        take: 200,
      });
    });
  });

  describe('getDeleteRequestStatus', () => {
    it('retorna o registro quando encontrado', async () => {
      const fakeRecord = { id: VALID_UUID, status: 'completed' };
      mockRepo.findOne.mockResolvedValue(fakeRecord);

      const status = await service.getDeleteRequestStatus(VALID_UUID);

      expect(status).toBeDefined();
      expect(status?.status).toBe('completed');
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: VALID_UUID } });
    });

    it('retorna null quando não encontrado', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const status = await service.getDeleteRequestStatus('non-existent-id');

      expect(status).toBeNull();
    });
  });

  describe('getPendingRequests', () => {
    it('retorna lista de requisições pending/in_progress', async () => {
      const fakeRecords = [
        { id: VALID_UUID, status: 'pending', user_id: OTHER_UUID },
      ];
      mockRepo.find.mockResolvedValue(fakeRecords);

      const pending = await service.getPendingRequests();

      expect(Array.isArray(pending)).toBe(true);
      expect(pending).toHaveLength(1);
    });
  });

  describe('validateUserConsent', () => {
    it('permite deleção quando usuário existe e sem requisição ativa', async () => {
      mockDataSource.query.mockResolvedValue([{ id: VALID_UUID }]);
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.validateUserConsent(VALID_UUID);

      expect(result.can_delete).toBe(true);
    });

    it('bloqueia quando usuário não existe', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.validateUserConsent(VALID_UUID);

      expect(result.can_delete).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('bloqueia quando já existe requisição pending para o usuário', async () => {
      mockDataSource.query.mockResolvedValue([{ id: VALID_UUID }]);
      mockRepo.findOne.mockResolvedValue({
        id: OTHER_UUID,
        status: 'pending',
        user_id: VALID_UUID,
      });

      const result = await service.validateUserConsent(VALID_UUID);

      expect(result.can_delete).toBe(false);
      expect(result.reason).toContain('pending');
      expect(result.reason).toContain(OTHER_UUID);
    });

    it('bloqueia quando já existe requisição in_progress para o usuário', async () => {
      mockDataSource.query.mockResolvedValue([{ id: VALID_UUID }]);
      mockRepo.findOne.mockResolvedValue({
        id: OTHER_UUID,
        status: 'in_progress',
        user_id: VALID_UUID,
      });

      const result = await service.validateUserConsent(VALID_UUID);

      expect(result.can_delete).toBe(false);
      expect(result.reason).toContain('in_progress');
    });
  });
});
