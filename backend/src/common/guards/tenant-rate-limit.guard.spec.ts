import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { TenantRateLimitGuard } from './tenant-rate-limit.guard';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { TenantService } from '../tenant/tenant.service';

type MockResponse = {
  setHeader: jest.Mock;
};

function createExecutionContext(
  request: Record<string, unknown>,
  response: MockResponse,
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantRateLimitGuard', () => {
  const originalDefaultPlan = process.env.TENANT_RATE_LIMIT_DEFAULT_PLAN;

  afterEach(() => {
    if (originalDefaultPlan === undefined) {
      delete process.env.TENANT_RATE_LIMIT_DEFAULT_PLAN;
    } else {
      process.env.TENANT_RATE_LIMIT_DEFAULT_PLAN = originalDefaultPlan;
    }
    jest.restoreAllMocks();
  });

  it('usa STARTER como fallback operacional quando o tenant nao informa plano', async () => {
    delete process.env.TENANT_RATE_LIMIT_DEFAULT_PLAN;

    const checkLimit = jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });

    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as unknown as TenantService;

    const rateLimitService = {
      checkLimit,
    } as unknown as TenantRateLimitService;

    const guard = new TenantRateLimitGuard(tenantService, rateLimitService, {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector);

    const response = { setHeader: jest.fn() };
    const context = createExecutionContext(
      {
        tenant: { companyId: 'company-1', isSuperAdmin: false },
      },
      response,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledWith('company-1', 'STARTER');
  });

  it('respeita o plano propagado pelo middleware de tenant', async () => {
    const checkLimit = jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 299,
      resetAt: Date.now() + 60_000,
    });

    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as unknown as TenantService;

    const rateLimitService = {
      checkLimit,
    } as unknown as TenantRateLimitService;

    const guard = new TenantRateLimitGuard(tenantService, rateLimitService, {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector);

    const response = { setHeader: jest.fn() };
    const context = createExecutionContext(
      {
        tenant: {
          companyId: 'company-1',
          isSuperAdmin: false,
          plan: 'PROFESSIONAL',
        },
      },
      response,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledWith('company-1', 'PROFESSIONAL');
  });

  it('retorna 429 com headers informativos quando o limite e excedido', async () => {
    process.env.TENANT_RATE_LIMIT_DEFAULT_PLAN = 'ENTERPRISE';

    const checkLimit = jest.fn().mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: 1_700_000_000_000,
      retryAfter: 60,
    });

    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as unknown as TenantService;

    const rateLimitService = {
      checkLimit,
    } as unknown as TenantRateLimitService;

    const guard = new TenantRateLimitGuard(tenantService, rateLimitService, {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector);

    const response = { setHeader: jest.fn() };
    const context = createExecutionContext(
      {
        method: 'GET',
        originalUrl: '/notifications/unread-count',
        ip: '127.0.0.1',
        tenant: { companyId: 'company-1', isSuperAdmin: false },
      },
      response,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Plan',
      'ENTERPRISE',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });
});
