import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiConsentGuard } from './ai-consent.guard';
import { ConsentsService } from '../../consents/consents.service';

const mockConsentsService = {
  hasActiveConsent: jest.fn(),
};

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
        { provide: ConsentsService, useValue: mockConsentsService },
      ],
    }).compile();

    guard = module.get<AiConsentGuard>(AiConsentGuard);
  });

  afterEach(() => jest.clearAllMocks());

  it('permite quando há aceite ativo de ai_processing na versão vigente', async () => {
    mockConsentsService.hasActiveConsent.mockResolvedValue(true);
    const result = await guard.canActivate(makeContext('u1'));
    expect(result).toBe(true);
    expect(mockConsentsService.hasActiveConsent).toHaveBeenCalledWith(
      'u1',
      'ai_processing',
    );
  });

  it('bloqueia com 403 quando não há aceite ativo (nunca aceitou ou revogou)', async () => {
    mockConsentsService.hasActiveConsent.mockResolvedValue(false);
    await expect(guard.canActivate(makeContext('u2'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('bloqueia com 403 quando não há userId no request (sem JWT)', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockConsentsService.hasActiveConsent).not.toHaveBeenCalled();
  });
});
