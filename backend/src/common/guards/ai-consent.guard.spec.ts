import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiConsentGuard } from './ai-consent.guard';
import { User } from '../../users/entities/user.entity';

const mockUserRepo = { findOne: jest.fn() };

const makeContext = (userId?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  }) as unknown as ExecutionContext;

describe('AiConsentGuard', () => {
  let guard: AiConsentGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiConsentGuard,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    guard = module.get<AiConsentGuard>(AiConsentGuard);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve permitir quando ai_processing_consent = true', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'u1',
      ai_processing_consent: true,
    });
    const result = await guard.canActivate(makeContext('u1'));
    expect(result).toBe(true);
  });

  it('deve lançar 403 quando ai_processing_consent = false', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'u2',
      ai_processing_consent: false,
    });
    await expect(guard.canActivate(makeContext('u2'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deve lançar 403 quando usuário não existe no banco', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('u3'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deve lançar 403 quando não há userId no request (sem JWT)', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });
});
