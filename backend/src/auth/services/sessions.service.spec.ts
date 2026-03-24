import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { UserSession } from '../entities/user-session.entity';
import { RedisService } from '../../common/redis/redis.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';

const SESSION_STUB: UserSession = {
  id: 'sess-1',
  user_id: 'user-1',
  ip: '1.2.3.4',
  device: 'Chrome/Windows',
  city: 'São Paulo',
  state: 'SP',
  country: 'Brasil',
  is_active: true,
  last_active: new Date('2024-01-01T10:00:00Z'),
  created_at: new Date('2024-01-01T09:00:00Z'),
  token_hash: 'hash-abc',
} as UserSession;

describe('SessionsService', () => {
  let service: SessionsService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockRedis = {
    revokeRefreshToken: jest.fn(),
    clearAllRefreshTokens: jest.fn(),
  };
  const mockAudit = { sessionRevoked: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getRepositoryToken(UserSession), useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: SecurityAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAllActive()', () => {
    it('deve retornar sessões mapeadas para SessionView', async () => {
      mockRepo.find.mockResolvedValue([SESSION_STUB]);

      const result = await service.findAllActive('user-1');

      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1', is_active: true },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'sess-1',
        ip: '1.2.3.4',
        device: 'Chrome/Windows',
        location: 'São Paulo, SP, Brasil',
      });
    });

    it('deve retornar lista vazia quando não há sessões ativas', async () => {
      mockRepo.find.mockResolvedValue([]);
      const result = await service.findAllActive('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('revokeOne()', () => {
    it('deve revogar sessão e token Redis', async () => {
      mockRepo.findOne.mockResolvedValue({ ...SESSION_STUB });
      mockRepo.save.mockResolvedValue(undefined);

      await service.revokeOne('sess-1', 'user-1');

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
      );
      expect(mockRedis.revokeRefreshToken).toHaveBeenCalledWith(
        'user-1',
        'hash-abc',
      );
      expect(mockAudit.sessionRevoked).toHaveBeenCalledWith(
        'user-1',
        'sess-1',
        'user-1',
      );
    });

    it('deve lançar NotFoundException quando sessão não pertence ao usuário', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeOne('sess-x', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('não deve chamar revokeRefreshToken se token_hash for nulo', async () => {
      mockRepo.findOne.mockResolvedValue({ ...SESSION_STUB, token_hash: null });
      mockRepo.save.mockResolvedValue(undefined);

      await service.revokeOne('sess-1', 'user-1');

      expect(mockRedis.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllOthers()', () => {
    it('deve marcar todas as sessões como inativas e limpar tokens Redis', async () => {
      mockRepo.update.mockResolvedValue(undefined);

      await service.revokeAllOthers('user-1');

      expect(mockRepo.update).toHaveBeenCalledWith(
        { user_id: 'user-1', is_active: true },
        { is_active: false },
      );
      expect(mockRedis.clearAllRefreshTokens).toHaveBeenCalledWith('user-1');
      expect(mockAudit.sessionRevoked).toHaveBeenCalledWith(
        'user-1',
        'all',
        'user-1',
      );
    });
  });
});
